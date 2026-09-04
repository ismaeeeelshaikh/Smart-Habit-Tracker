"""Integration tests for the /api/slots endpoints.

The engine itself is covered exhaustively in test_slot_engine.py; these check
the adapter layer — ownership, the user's own day window, timezone handling, and
the empty states the UX Flow Document specifies.
"""

import pytest


async def add_fixed(client, day, label, start, end):
    res = await client.post(
        "/api/schedule/",
        json={
            "day_of_week": day,
            "label": label,
            "is_flexible_block": False,
            "start_time": start,
            "end_time": end,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_flexible(client, day, label, availability):
    res = await client.post(
        "/api/schedule/",
        json={
            "day_of_week": day,
            "label": label,
            "is_flexible_block": True,
            "flexible_availability": availability,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


async def add_goal(client, name, priority, minutes, is_active=True):
    res = await client.post(
        "/api/goals/",
        json={
            "name": name,
            "priority": priority,
            "estimated_duration_minutes": minutes,
            "is_active": is_active,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


class TestFreeSlots:
    async def test_empty_schedule_gives_a_full_window_every_day(self, auth_client):
        body = (await auth_client.get("/api/slots/free")).json()

        assert body["day_start_time"] == "08:00:00"
        assert body["day_end_time"] == "22:00:00"
        assert set(body["slots_by_day"]) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
        assert body["slots_by_day"]["mon"] == [
            {
                "day_of_week": "mon",
                "start_time": "08:00:00",
                "end_time": "22:00:00",
                "duration_minutes": 840,
            }
        ]

    async def test_commitments_split_the_day(self, auth_client):
        await add_fixed(auth_client, "mon", "Work", "09:00:00", "17:00:00")

        monday = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]["mon"]
        assert [(s["start_time"], s["end_time"]) for s in monday] == [
            ("08:00:00", "09:00:00"),
            ("17:00:00", "22:00:00"),
        ]

    async def test_flexible_busy_day_has_no_slots(self, auth_client):
        await add_flexible(auth_client, "sun", "Family", "busy")

        week = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]
        assert week["sun"] == []
        assert len(week["sat"]) == 1

    async def test_flexible_free_day_stays_open(self, auth_client):
        await add_flexible(auth_client, "sat", "Mostly Free", "free")

        week = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]
        assert [(s["start_time"], s["end_time"]) for s in week["sat"]] == [
            ("08:00:00", "22:00:00")
        ]

    async def test_another_users_schedule_does_not_leak_in(self, auth_client, client, unique_email):
        await add_fixed(auth_client, "mon", "My work", "09:00:00", "17:00:00")
        mine = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]["mon"]

        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        other = await client.get(
            "/api/slots/free",
            headers={"Authorization": f"Bearer {res.json()['access_token']}"},
        )
        assert len(mine) == 2
        assert len(other.json()["slots_by_day"]["mon"]) == 1

    async def test_requires_authentication(self, client):
        assert (await client.get("/api/slots/free")).status_code == 401


class TestTodaysFreeSlots:
    async def test_returns_todays_date_and_timezone(self, auth_client):
        body = (await auth_client.get("/api/slots/free/today")).json()

        assert body["timezone"] == "UTC"
        assert "date" in body
        # Every returned slot must belong to today.
        assert all(s["date"] == body["date"] for s in body["slots"])

    async def test_a_fully_committed_today_returns_no_slots(self, auth_client):
        # Block every weekday so the assertion holds whatever day the suite runs.
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
            await add_flexible(auth_client, day, "Booked", "busy")

        assert (await auth_client.get("/api/slots/free/today")).json()["slots"] == []


class TestNextSuggestion:
    async def test_suggests_the_prd_worked_example(self, auth_client):
        await add_goal(auth_client, "Learn React", "high", 20)
        await add_goal(auth_client, "Meditation", "low", 10)

        body = (await auth_client.get("/api/slots/next")).json()

        assert body["slot"] is not None
        names = [(a["goal_name"], a["minutes"]) for a in body["allocations"]]
        assert ("Learn React", 20) in names
        assert ("Meditation", 10) in names

    async def test_allocation_times_sit_inside_the_slot(self, auth_client):
        await add_goal(auth_client, "Learn React", "high", 20)

        body = (await auth_client.get("/api/slots/next")).json()
        allocation = body["allocations"][0]

        assert body["slot"]["start"] <= allocation["start"]
        assert allocation["end"] <= body["slot"]["end"]

    async def test_inactive_goals_are_never_suggested(self, auth_client):
        await add_goal(auth_client, "Dormant", "high", 20, is_active=False)

        body = (await auth_client.get("/api/slots/next")).json()
        assert body["allocations"] == []
        assert body["reason"] == "Add a goal to get personalized suggestions."

    async def test_no_goals_explains_itself(self, auth_client):
        body = (await auth_client.get("/api/slots/next")).json()

        assert body["allocations"] == []
        assert body["reason"] == "Add a goal to get personalized suggestions."

    async def test_no_free_time_anywhere_explains_itself(self, auth_client):
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
            await add_flexible(auth_client, day, "Booked", "busy")
        await add_goal(auth_client, "Learn React", "high", 20)

        body = (await auth_client.get("/api/slots/next")).json()
        assert body["slot"] is None
        assert body["reason"] == "No upcoming free slots found in your schedule."

    async def test_a_goal_too_long_for_any_slot_explains_itself(self, auth_client):
        # Leave only a 30-minute gap each day, then ask for a 4-hour goal.
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
            await add_fixed(auth_client, day, "Morning", "08:00:00", "12:00:00")
            await add_fixed(auth_client, day, "Afternoon", "12:30:00", "22:00:00")
        await add_goal(auth_client, "Marathon study", "high", 240)

        body = (await auth_client.get("/api/slots/next")).json()
        assert body["allocations"] == []
        assert body["reason"] == "None of your goals fit in your upcoming free time."

    @pytest.mark.parametrize("horizon", [0, 15])
    async def test_rejects_an_out_of_range_horizon(self, auth_client, horizon):
        res = await auth_client.get(f"/api/slots/next?horizon_days={horizon}")
        assert res.status_code == 422


class TestScheduleBlockValidation:
    async def test_flexible_block_requires_an_availability(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/",
            json={"day_of_week": "sun", "label": "Family", "is_flexible_block": True},
        )
        assert res.status_code == 400
        assert "free" in res.json()["detail"]

    async def test_fixed_block_rejects_an_availability(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/",
            json={
                "day_of_week": "mon",
                "label": "Work",
                "is_flexible_block": False,
                "start_time": "09:00:00",
                "end_time": "17:00:00",
                "flexible_availability": "busy",
            },
        )
        assert res.status_code == 400

    async def test_flexible_block_rejects_times(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/",
            json={
                "day_of_week": "sun",
                "label": "Family",
                "is_flexible_block": True,
                "flexible_availability": "busy",
                "start_time": "09:00:00",
                "end_time": "17:00:00",
            },
        )
        assert res.status_code == 400

    async def test_end_before_start_is_rejected(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/",
            json={
                "day_of_week": "mon",
                "label": "Backwards",
                "is_flexible_block": False,
                "start_time": "17:00:00",
                "end_time": "09:00:00",
            },
        )
        assert res.status_code == 400
        assert res.json()["detail"] == "End time must be after start time."

    async def test_switching_fixed_to_flexible_clears_the_times(self, auth_client):
        block = await add_fixed(auth_client, "mon", "Work", "09:00:00", "17:00:00")

        res = await auth_client.put(
            f"/api/schedule/{block['id']}",
            json={"is_flexible_block": True, "flexible_availability": "busy"},
        )
        assert res.status_code == 200, res.text
        updated = res.json()
        assert updated["start_time"] is None
        assert updated["end_time"] is None
        assert updated["flexible_availability"] == "busy"

    async def test_switching_flexible_to_fixed_clears_the_availability(self, auth_client):
        block = await add_flexible(auth_client, "sun", "Family", "busy")

        res = await auth_client.put(
            f"/api/schedule/{block['id']}",
            json={
                "is_flexible_block": False,
                "start_time": "10:00:00",
                "end_time": "12:00:00",
            },
        )
        assert res.status_code == 200, res.text
        updated = res.json()
        assert updated["flexible_availability"] is None
        assert updated["start_time"] == "10:00:00"

    async def test_partial_update_keeps_the_rest_of_the_row_valid(self, auth_client):
        block = await add_fixed(auth_client, "mon", "Work", "09:00:00", "17:00:00")

        res = await auth_client.put(f"/api/schedule/{block['id']}", json={"label": "Deep work"})
        assert res.status_code == 200
        assert res.json()["label"] == "Deep work"
        assert res.json()["start_time"] == "09:00:00"

    async def test_partial_update_that_would_invert_the_times_is_rejected(self, auth_client):
        block = await add_fixed(auth_client, "mon", "Work", "09:00:00", "17:00:00")

        res = await auth_client.put(
            f"/api/schedule/{block['id']}", json={"start_time": "18:00:00"}
        )
        assert res.status_code == 400
