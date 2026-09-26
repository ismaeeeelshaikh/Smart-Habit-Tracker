"""/api/days-off — dates on which the app stays quiet.

A schedule is a weekly pattern, so "no college on Diwali" needs its own row.
"""

from datetime import date, timedelta

from app.db.models import DayOff


def today() -> date:
    # The test users are on UTC, so the API's "today" is UTC's today.
    from datetime import UTC, datetime

    return datetime.now(UTC).date()


async def add(client, start, end=None, label="Diwali"):
    body = {"label": label, "start_date": start.isoformat()}
    if end is not None:
        body["end_date"] = end.isoformat()
    return await client.post("/api/days-off/", json=body)


class TestAdding:
    async def test_one_day(self, auth_client):
        day = today() + timedelta(days=3)

        res = await add(auth_client, day)

        assert res.status_code == 201, res.text
        assert [(d["date"], d["label"]) for d in res.json()] == [(day.isoformat(), "Diwali")]

    async def test_a_range_is_one_row_per_day(self, auth_client):
        start = today() + timedelta(days=5)

        res = await add(auth_client, start, start + timedelta(days=3))

        assert [d["date"] for d in res.json()] == [
            (start + timedelta(days=n)).isoformat() for n in range(4)
        ]

    async def test_a_day_already_off_takes_the_new_name(self, auth_client):
        day = today() + timedelta(days=2)
        await add(auth_client, day, label="Holiday")

        await add(auth_client, day, label="Diwali")

        listed = (await auth_client.get("/api/days-off/")).json()
        assert [(d["date"], d["label"]) for d in listed] == [(day.isoformat(), "Diwali")]

    async def test_today_is_allowed(self, auth_client):
        assert (await add(auth_client, today())).status_code == 201

    async def test_the_past_is_refused(self, auth_client):
        res = await add(auth_client, today() - timedelta(days=1))

        assert res.status_code == 422

    async def test_a_backwards_range_is_refused(self, auth_client):
        start = today() + timedelta(days=5)

        res = await add(auth_client, start, start - timedelta(days=1))

        assert res.status_code == 422

    async def test_more_than_a_month_at_once_is_refused(self, auth_client):
        start = today() + timedelta(days=1)

        res = await add(auth_client, start, start + timedelta(days=31))

        assert res.status_code == 422

    async def test_it_needs_a_logged_in_user(self, client):
        assert (await add(client, today())).status_code == 401


class TestListing:
    async def test_only_today_and_later_soonest_first(self, auth_client, db_session):
        me = (await auth_client.get("/auth/me")).json()
        db_session.add(DayOff(user_id=me["id"], date=today() - timedelta(days=4), label="Old"))
        await db_session.commit()
        await add(auth_client, today() + timedelta(days=9), label="Later")
        await add(auth_client, today() + timedelta(days=1), label="Sooner")

        listed = (await auth_client.get("/api/days-off/")).json()

        assert [d["label"] for d in listed] == ["Sooner", "Later"]


class TestRemoving:
    async def test_a_day_off_can_be_removed(self, auth_client):
        (row,) = (await add(auth_client, today() + timedelta(days=1))).json()

        res = await auth_client.delete(f"/api/days-off/{row['id']}")

        assert res.status_code == 204
        assert (await auth_client.get("/api/days-off/")).json() == []

    async def test_someone_elses_day_off_is_not_found(self, auth_client, client, unique_email):
        (row,) = (await add(auth_client, today() + timedelta(days=1))).json()

        signup = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        other = {"Authorization": f"Bearer {signup.json()['access_token']}"}
        res = await client.delete(f"/api/days-off/{row['id']}", headers=other)

        assert res.status_code == 404


class TestSuggestionsSkipIt:
    async def test_the_next_suggestion_is_never_on_a_day_off(self, auth_client):
        """An empty calendar is free all day, every day — so without a day off
        the next slot would be today (or tomorrow if today's window is over)."""
        await auth_client.post(
            "/api/goals/", json={"name": "DSA", "priority": "high", "estimated_duration_minutes": 30}
        )
        await add(auth_client, today(), today() + timedelta(days=1), label="Diwali")

        res = await auth_client.get("/api/slots/next")

        assert res.status_code == 200, res.text
        slot = res.json()["slot"]
        assert slot is not None
        assert date.fromisoformat(slot["start"][:10]) >= today() + timedelta(days=2)
