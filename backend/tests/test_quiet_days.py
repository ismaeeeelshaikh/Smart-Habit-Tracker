"""Quiet weekdays: the weekly version of a day off, kept on the user."""

from datetime import UTC, date, datetime, timedelta

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


async def set_quiet(client, days):
    return await client.patch("/api/users/me/preferences", json={"quiet_days": days})


class TestPreferences:
    async def test_none_by_default(self, auth_client):
        me = (await auth_client.get("/auth/me")).json()

        assert me["quiet_days"] == []

    async def test_stored_once_each_in_week_order(self, auth_client):
        res = await set_quiet(auth_client, ["sun", "sat", "sat"])

        assert res.status_code == 200, res.text
        assert res.json()["quiet_days"] == ["sat", "sun"]
        assert (await auth_client.get("/auth/me")).json()["quiet_days"] == ["sat", "sun"]

    async def test_the_list_replaces_what_was_there(self, auth_client):
        await set_quiet(auth_client, ["sat", "sun"])

        res = await set_quiet(auth_client, ["sun"])

        assert res.json()["quiet_days"] == ["sun"]

    async def test_an_empty_list_turns_every_day_back_on(self, auth_client):
        await set_quiet(auth_client, ["sat"])

        assert (await set_quiet(auth_client, [])).json()["quiet_days"] == []

    async def test_other_preferences_leave_it_alone(self, auth_client):
        await set_quiet(auth_client, ["sun"])

        res = await auth_client.patch("/api/users/me/preferences", json={"day_start_time": "07:00:00"})

        assert res.json()["quiet_days"] == ["sun"]

    async def test_something_that_is_not_a_weekday_is_refused(self, auth_client):
        assert (await set_quiet(auth_client, ["someday"])).status_code == 422


class TestSuggestionsSkipThem:
    async def test_the_next_suggestion_is_never_on_a_quiet_weekday(self, auth_client):
        """An empty calendar is free every day, so without quiet days the next
        slot would be today or tomorrow."""
        await auth_client.post(
            "/api/goals/", json={"name": "DSA", "priority": "high", "estimated_duration_minutes": 30}
        )
        today: date = datetime.now(UTC).date()
        quiet = [WEEKDAYS[(today + timedelta(days=n)).weekday()] for n in range(2)]
        await set_quiet(auth_client, quiet)

        res = await auth_client.get("/api/slots/next")

        slot = res.json()["slot"]
        assert slot is not None
        assert WEEKDAYS[date.fromisoformat(slot["start"][:10]).weekday()] not in quiet
