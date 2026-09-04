"""Integration tests for GET /api/stats/weekly.

The documents specify what the screen shows but not how to count it, so these
tests pin the arithmetic described in the endpoint's docstring: one outcome per
reminder (latest wins), skip events counted raw, deleted goals dropping out of
the priority tiers, and week boundaries in the user's own timezone.
"""

from datetime import UTC, datetime, timedelta

import pytest_asyncio
from sqlalchemy.future import select

from app.db.models import CompletionLog, Reminder


async def add_goal(client, name, priority="high", minutes=30):
    res = await client.post(
        "/api/goals/",
        json={"name": name, "priority": priority, "estimated_duration_minutes": minutes},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_reminder(client, label=None, goal_id=None, days_ahead=1):
    payload = {"scheduled_time": (datetime.now(UTC) + timedelta(days=days_ahead)).isoformat()}
    if goal_id:
        payload["goal_id"] = goal_id
    else:
        payload["label"] = label or "One-off"
    res = await client.post("/api/reminders/", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


async def act(client, reminder_id, status):
    res = await client.put(f"/api/reminders/{reminder_id}/status", json={"status": status})
    assert res.status_code == 200, res.text
    return res.json()


@pytest_asyncio.fixture
async def stats_of(auth_client):
    async def _fetch(**params):
        res = await auth_client.get("/api/stats/weekly", params=params)
        assert res.status_code == 200, res.text
        return res.json()

    return _fetch


class TestEmptyWeek:
    async def test_a_week_with_no_activity_reports_zero_not_an_error(self, stats_of):
        body = await stats_of()

        assert body["total_actions"] == 0
        assert body["overall"] == {"completed": 0, "total": 0, "completion_rate": 0}
        assert body["most_skipped"] is None

    async def test_every_priority_tier_is_present_even_when_unused(self, stats_of):
        body = await stats_of()

        assert set(body["by_priority"]) == {"high", "medium", "low"}

    async def test_the_week_runs_monday_to_sunday(self, stats_of):
        body = await stats_of()

        start = datetime.fromisoformat(body["week_start"]).date()
        end = datetime.fromisoformat(body["week_end"]).date()
        assert start.weekday() == 0
        assert end.weekday() == 6
        assert (end - start).days == 6

    async def test_requires_authentication(self, client):
        assert (await client.get("/api/stats/weekly")).status_code == 401


class TestCompletionRates:
    async def test_counts_completions_against_their_priority(self, auth_client, stats_of):
        goal = await add_goal(auth_client, "Learn Spanish", priority="high")
        done = await add_reminder(auth_client, goal_id=goal["id"])
        skipped = await add_reminder(auth_client, goal_id=goal["id"])
        await act(auth_client, done["id"], "done")
        await act(auth_client, skipped["id"], "skipped")

        body = await stats_of()

        assert body["by_priority"]["high"] == {
            "completed": 1,
            "total": 2,
            "completion_rate": 50,
        }

    async def test_priorities_are_tallied_independently(self, auth_client, stats_of):
        high = await add_goal(auth_client, "Thesis", priority="high")
        low = await add_goal(auth_client, "Guitar", priority="low")
        await act(auth_client, (await add_reminder(auth_client, goal_id=high["id"]))["id"], "done")
        await act(
            auth_client, (await add_reminder(auth_client, goal_id=low["id"]))["id"], "skipped"
        )

        body = await stats_of()

        assert body["by_priority"]["high"]["completion_rate"] == 100
        assert body["by_priority"]["low"]["completion_rate"] == 0
        assert body["by_priority"]["medium"]["total"] == 0

    async def test_snoozing_then_finishing_counts_once_as_done(self, auth_client, stats_of):
        goal = await add_goal(auth_client, "Read", priority="medium")
        reminder = await add_reminder(auth_client, goal_id=goal["id"])

        await act(auth_client, reminder["id"], "later")
        await act(auth_client, reminder["id"], "done")

        body = await stats_of()

        # Two log rows, one reminder: the later action wins, and the denominator
        # stays at one.
        assert body["total_actions"] == 2
        assert body["by_priority"]["medium"] == {
            "completed": 1,
            "total": 1,
            "completion_rate": 100,
        }

    async def test_a_one_off_counts_overall_but_has_no_priority(self, auth_client, stats_of):
        reminder = await add_reminder(auth_client, label="Call the dentist")
        await act(auth_client, reminder["id"], "done")

        body = await stats_of()

        assert body["overall"] == {"completed": 1, "total": 1, "completion_rate": 100}
        assert all(tier["total"] == 0 for tier in body["by_priority"].values())

    async def test_deleting_the_goal_drops_its_tier_but_keeps_the_overall_count(
        self, auth_client, stats_of
    ):
        goal = await add_goal(auth_client, "Doomed", priority="high")
        reminder = await add_reminder(auth_client, goal_id=goal["id"])
        await act(auth_client, reminder["id"], "done")

        await auth_client.delete(f"/api/goals/{goal['id']}")

        body = await stats_of()

        # goal_id went NULL, so the priority is gone — but the work still happened.
        assert body["by_priority"]["high"]["total"] == 0
        assert body["overall"]["completed"] == 1


class TestMostSkipped:
    async def test_reports_the_label_with_the_most_skips(self, auth_client, stats_of):
        once = await add_reminder(auth_client, label="Stretching")
        await act(auth_client, once["id"], "skipped")
        for _ in range(2):
            twice = await add_reminder(auth_client, label="Reading")
            await act(auth_client, twice["id"], "skipped")

        body = await stats_of()

        assert body["most_skipped"] == {"label": "Reading", "skips": 2}

    async def test_repeated_skips_of_one_reminder_all_count(self, auth_client, stats_of):
        reminder = await add_reminder(auth_client, label="Reading")

        await act(auth_client, reminder["id"], "skipped")
        await act(auth_client, reminder["id"], "skipped")

        # Skip *events*, not distinct reminders — this measures the behaviour.
        assert (await stats_of())["most_skipped"] == {"label": "Reading", "skips": 2}

    async def test_nothing_skipped_reports_nothing(self, auth_client, stats_of):
        reminder = await add_reminder(auth_client, label="Stretching")
        await act(auth_client, reminder["id"], "done")

        assert (await stats_of())["most_skipped"] is None


class TestWeekSelection:
    async def test_any_date_in_a_week_resolves_to_that_monday(self, stats_of):
        # 2026-09-09 is a Wednesday.
        body = await stats_of(week_start="2026-09-09")

        assert body["week_start"] == "2026-09-07"
        assert body["week_end"] == "2026-09-13"

    async def test_another_week_does_not_see_this_weeks_activity(
        self, auth_client, stats_of, db_session
    ):
        reminder = await add_reminder(auth_client, label="Stretching")
        await act(auth_client, reminder["id"], "done")

        # Backdate the log rather than the reminder: the window filters on when
        # the action happened.
        result = await db_session.execute(
            select(CompletionLog).where(CompletionLog.reminder_id == reminder["id"])
        )
        log = result.scalars().one()
        log.timestamp = datetime.now(UTC) - timedelta(days=21)
        await db_session.commit()

        assert (await stats_of())["total_actions"] == 0

        three_weeks_ago = (datetime.now(UTC) - timedelta(days=21)).date().isoformat()
        assert (await stats_of(week_start=three_weeks_ago))["total_actions"] == 1


class TestOwnership:
    @pytest_asyncio.fixture
    async def other_users_activity(self, client, unique_email):
        """User A completes a reminder, then A's token is dropped."""
        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
        reminder = await add_reminder(client, label="Their private task")
        await act(client, reminder["id"], "done")
        client.headers.pop("Authorization")
        return reminder

    async def test_another_users_activity_is_invisible(self, other_users_activity, stats_of):
        body = await stats_of()

        assert body["total_actions"] == 0
        assert body["overall"]["total"] == 0

    async def test_another_users_reminder_rows_still_exist(
        self, other_users_activity, auth_client, db_session
    ):
        """Guards against the stats query being scoped by deleting data."""
        result = await db_session.execute(
            select(Reminder).where(Reminder.id == other_users_activity["id"])
        )
        assert result.scalars().first() is not None
