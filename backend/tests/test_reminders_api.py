"""Integration tests for the /api/reminders endpoints.

Covers the rules the UX Flow Document Section 8 and the Backend Schema Document
Section 2.4 put on this surface: the label snapshot, the recurrence/rule
consistency the CHECK constraint enforces, future-dating of one-offs, the filters
the Reminders screen drives, and the completion_logs trail the stats view will
later count.
"""

from datetime import UTC, datetime, timedelta

import pytest_asyncio
from sqlalchemy.future import select

from app.db.models import CompletionLog


def in_days(days: float) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


async def add_goal(client, name="Learn Spanish", priority="high", minutes=30):
    res = await client.post(
        "/api/goals/",
        json={"name": name, "priority": priority, "estimated_duration_minutes": minutes},
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_reminder(client, **overrides):
    payload = {"label": "Stretch", "scheduled_time": in_days(1)}
    payload.update(overrides)
    res = await client.post("/api/reminders/", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


class TestCreateReminder:
    async def test_a_manual_reminder_starts_pending_and_non_recurring(self, auth_client):
        body = await add_reminder(auth_client, label="Call the dentist")

        assert body["label"] == "Call the dentist"
        assert body["status"] == "pending"
        assert body["is_recurring"] is False
        assert body["recurrence_rule"] == "none"
        assert body["goal_id"] is None

    async def test_a_goal_backed_reminder_snapshots_the_goal_name(self, auth_client):
        goal = await add_goal(auth_client, name="Learn Spanish")

        body = await add_reminder(auth_client, goal_id=goal["id"], label=None)

        assert body["goal_id"] == goal["id"]
        assert body["label"] == "Learn Spanish"

    async def test_the_snapshot_survives_renaming_the_goal(self, auth_client):
        goal = await add_goal(auth_client, name="Learn Spanish")
        reminder = await add_reminder(auth_client, goal_id=goal["id"], label=None)

        await auth_client.put(f"/api/goals/{goal['id']}", json={"name": "Learn Portuguese"})

        listed = (await auth_client.get("/api/reminders/")).json()
        assert [r["label"] for r in listed if r["id"] == reminder["id"]] == ["Learn Spanish"]

    async def test_the_snapshot_survives_deleting_the_goal(self, auth_client):
        goal = await add_goal(auth_client, name="Learn Spanish")
        reminder = await add_reminder(auth_client, goal_id=goal["id"], label=None)

        await auth_client.delete(f"/api/goals/{goal['id']}")

        listed = (await auth_client.get("/api/reminders/")).json()
        kept = [r for r in listed if r["id"] == reminder["id"]]
        assert kept and kept[0]["label"] == "Learn Spanish"
        # ON DELETE SET NULL: the history stays, the link goes.
        assert kept[0]["goal_id"] is None

    async def test_a_recurring_reminder_gets_its_flag_derived(self, auth_client):
        body = await add_reminder(auth_client, recurrence_rule="weekdays")

        assert body["recurrence_rule"] == "weekdays"
        assert body["is_recurring"] is True

    async def test_a_recurring_reminder_may_be_anchored_in_the_past(self, auth_client):
        body = await add_reminder(
            auth_client, recurrence_rule="daily", scheduled_time=in_days(-3)
        )

        assert body["is_recurring"] is True

    async def test_a_one_off_in_the_past_is_rejected(self, auth_client):
        res = await auth_client.post(
            "/api/reminders/",
            json={"label": "Yesterday's task", "scheduled_time": in_days(-1)},
        )
        assert res.status_code == 422

    async def test_neither_goal_nor_label_is_rejected(self, auth_client):
        res = await auth_client.post(
            "/api/reminders/", json={"scheduled_time": in_days(1)}
        )
        assert res.status_code == 422

    async def test_both_goal_and_label_is_rejected(self, auth_client):
        goal = await add_goal(auth_client)
        res = await auth_client.post(
            "/api/reminders/",
            json={
                "goal_id": goal["id"],
                "label": "Something else",
                "scheduled_time": in_days(1),
            },
        )
        assert res.status_code == 422

    async def test_a_blank_label_is_rejected(self, auth_client):
        res = await auth_client.post(
            "/api/reminders/", json={"label": "   ", "scheduled_time": in_days(1)}
        )
        assert res.status_code == 422

    async def test_requires_authentication(self, client):
        res = await client.post(
            "/api/reminders/", json={"label": "Stretch", "scheduled_time": in_days(1)}
        )
        assert res.status_code == 401


class TestListReminders:
    async def test_empty_by_default(self, auth_client):
        res = await auth_client.get("/api/reminders/")
        assert res.status_code == 200
        assert res.json() == []

    async def test_returned_oldest_first(self, auth_client):
        await add_reminder(auth_client, label="Later", scheduled_time=in_days(5))
        await add_reminder(auth_client, label="Sooner", scheduled_time=in_days(1))

        listed = (await auth_client.get("/api/reminders/")).json()
        assert [r["label"] for r in listed] == ["Sooner", "Later"]

    async def test_filters_by_status(self, auth_client):
        done = await add_reminder(auth_client, label="Done one")
        await add_reminder(auth_client, label="Still pending")
        await auth_client.put(f"/api/reminders/{done['id']}/status", json={"status": "done"})

        listed = (await auth_client.get("/api/reminders/?status=done")).json()
        assert [r["label"] for r in listed] == ["Done one"]

    async def test_filters_by_window(self, auth_client):
        await add_reminder(auth_client, label="In range", scheduled_time=in_days(2))
        await add_reminder(auth_client, label="Out of range", scheduled_time=in_days(20))

        # Passed as params, not interpolated: an ISO offset contains a '+', which
        # decodes as a space in a raw query string.
        res = await auth_client.get(
            "/api/reminders/", params={"start": in_days(1), "end": in_days(7)}
        )
        assert res.status_code == 200, res.text
        assert [r["label"] for r in res.json()] == ["In range"]

    async def test_requires_authentication(self, client):
        assert (await client.get("/api/reminders/")).status_code == 401


class TestUpdateStatus:
    async def test_marking_done_updates_the_row(self, auth_client):
        reminder = await add_reminder(auth_client)

        res = await auth_client.put(
            f"/api/reminders/{reminder['id']}/status", json={"status": "done"}
        )

        assert res.status_code == 200
        assert res.json()["status"] == "done"

    async def test_each_action_appends_a_completion_log(self, auth_client, db_session):
        reminder = await add_reminder(auth_client)

        await auth_client.put(f"/api/reminders/{reminder['id']}/status", json={"status": "later"})
        await auth_client.put(f"/api/reminders/{reminder['id']}/status", json={"status": "done"})

        result = await db_session.execute(
            select(CompletionLog).where(CompletionLog.reminder_id == reminder["id"])
        )
        actions = [log.action.value for log in result.scalars().all()]
        # Append-only: snoozing then finishing leaves both events behind.
        assert sorted(actions) == ["done", "later"]

    async def test_pending_is_not_an_action(self, auth_client):
        reminder = await add_reminder(auth_client)

        res = await auth_client.put(
            f"/api/reminders/{reminder['id']}/status", json={"status": "pending"}
        )
        assert res.status_code == 422

    async def test_unknown_status_is_rejected(self, auth_client):
        reminder = await add_reminder(auth_client)

        res = await auth_client.put(
            f"/api/reminders/{reminder['id']}/status", json={"status": "procrastinated"}
        )
        assert res.status_code == 422

    async def test_a_missing_reminder_is_404(self, auth_client):
        res = await auth_client.put(
            "/api/reminders/00000000-0000-0000-0000-000000000000/status",
            json={"status": "done"},
        )
        assert res.status_code == 404


class TestOwnership:
    @pytest_asyncio.fixture
    async def other_users_reminder(self, client, unique_email):
        """Create a reminder owned by user A, then drop A's token."""
        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
        reminder = await add_reminder(client, label="Private reminder")
        client.headers.pop("Authorization")
        return reminder

    async def test_another_users_reminder_is_not_listed(self, other_users_reminder, auth_client):
        assert (await auth_client.get("/api/reminders/")).json() == []

    async def test_another_users_reminder_cannot_be_actioned(
        self, other_users_reminder, auth_client
    ):
        res = await auth_client.put(
            f"/api/reminders/{other_users_reminder['id']}/status", json={"status": "done"}
        )
        assert res.status_code == 404

    @pytest_asyncio.fixture
    async def other_users_goal(self, client, unique_email):
        """Create a goal owned by user A, then drop A's token."""
        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
        goal = await add_goal(client, name="Someone else's goal")
        client.headers.pop("Authorization")
        return goal

    async def test_another_users_goal_cannot_be_attached(self, other_users_goal, auth_client):
        """Borrowing someone else's goal_id must not leak its name into a label."""
        res = await auth_client.post(
            "/api/reminders/",
            json={"goal_id": other_users_goal["id"], "scheduled_time": in_days(1)},
        )
        assert res.status_code == 404
