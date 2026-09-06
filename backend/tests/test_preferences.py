"""The usable-day window and timezone drive every slot computation."""


async def test_defaults_to_an_eight_to_ten_window(auth_client):
    body = (await auth_client.get("/auth/me")).json()
    assert body["day_start_time"] == "08:00:00"
    assert body["day_end_time"] == "22:00:00"
    assert body["timezone"] == "UTC"


async def test_updating_the_window_changes_computed_slots(auth_client):
    await auth_client.post(
        "/api/schedule/",
        json={
            "day_of_week": "mon",
            "label": "Work",
            "is_flexible_block": False,
            "start_time": "09:00:00",
            "end_time": "17:00:00",
        },
    )

    before = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]["mon"]
    assert (before[0]["start_time"], before[-1]["end_time"]) == ("08:00:00", "22:00:00")

    res = await auth_client.patch(
        "/api/users/me/preferences",
        json={"day_start_time": "06:00:00", "day_end_time": "23:00:00"},
    )
    assert res.status_code == 200, res.text

    after = (await auth_client.get("/api/slots/free")).json()["slots_by_day"]["mon"]
    assert [(s["start_time"], s["end_time"]) for s in after] == [
        ("06:00:00", "09:00:00"),
        ("17:00:00", "23:00:00"),
    ]


async def test_a_partial_update_is_validated_against_the_stored_row(auth_client):
    # Start alone would invert the stored 22:00 end only if it passed 22:00.
    ok = await auth_client.patch(
        "/api/users/me/preferences", json={"day_start_time": "07:00:00"}
    )
    assert ok.status_code == 200
    assert ok.json()["day_start_time"] == "07:00:00"

    bad = await auth_client.patch(
        "/api/users/me/preferences", json={"day_start_time": "23:00:00"}
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Day end time must be after day start time."


async def test_an_inverted_window_is_rejected(auth_client):
    res = await auth_client.patch(
        "/api/users/me/preferences",
        json={"day_start_time": "22:00:00", "day_end_time": "08:00:00"},
    )
    assert res.status_code == 400


async def test_timezone_must_be_a_real_zone(auth_client):
    good = await auth_client.patch(
        "/api/users/me/preferences", json={"timezone": "Asia/Kolkata"}
    )
    assert good.status_code == 200
    assert good.json()["timezone"] == "Asia/Kolkata"

    bad = await auth_client.patch(
        "/api/users/me/preferences", json={"timezone": "Mars/Olympus_Mons"}
    )
    assert bad.status_code == 400


async def test_timezone_changes_which_day_today_refers_to(auth_client):
    await auth_client.patch("/api/users/me/preferences", json={"timezone": "Pacific/Kiritimati"})
    ahead = (await auth_client.get("/api/slots/free/today")).json()

    await auth_client.patch("/api/users/me/preferences", json={"timezone": "Pacific/Midway"})
    behind = (await auth_client.get("/api/slots/free/today")).json()

    assert ahead["timezone"] == "Pacific/Kiritimati"
    assert behind["timezone"] == "Pacific/Midway"
    # ~25 hours apart, so the two zones are never on the same calendar date.
    assert ahead["date"] != behind["date"]


async def test_preferences_require_authentication(client):
    assert (await client.patch("/api/users/me/preferences", json={})).status_code == 401


class TestTimezoneAliases:
    """Regression: a real user was shown times 5.5 hours out for two days.

    Browsers still report the legacy alias Asia/Calcutta, the slim base image's
    trimmed database only carries Asia/Kolkata, so every lookup failed and fell
    back to UTC — silently, because the fallback logged nothing and signup
    never checked the value it stored.
    """

    async def test_the_legacy_alias_a_browser_sends_resolves(self):
        from zoneinfo import ZoneInfo

        # If this fails, tzdata is missing from the image again.
        assert ZoneInfo("Asia/Calcutta") is not None
        assert ZoneInfo("Asia/Kolkata") is not None

    async def test_signing_up_in_that_zone_keeps_it(self, client, unique_email):
        res = await client.post(
            "/auth/signup",
            json={
                "email": unique_email(),
                "password": "password123",
                "timezone": "Asia/Calcutta",
            },
        )
        assert res.status_code == 201, res.text

        me = await client.get(
            "/auth/me", headers={"Authorization": f"Bearer {res.json()['access_token']}"}
        )
        assert me.json()["timezone"] == "Asia/Calcutta"

    async def test_that_users_clock_is_not_utc(self, client, unique_email):
        """The actual symptom: 10:21 PM local was being reported as 4:49 PM."""
        from datetime import UTC, datetime, timedelta

        res = await client.post(
            "/auth/signup",
            json={
                "email": unique_email(),
                "password": "password123",
                "timezone": "Asia/Calcutta",
            },
        )
        client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"

        body = (await client.get("/api/slots/free/today")).json()
        assert body["timezone"] == "Asia/Calcutta"

        # India is UTC+5:30 and never observes DST, so today's local date and
        # the UTC date differ for 5.5 hours of every day, and the reported day
        # must follow the user's clock rather than the server's.
        now_utc = datetime.now(UTC)
        expected = (now_utc + timedelta(hours=5, minutes=30)).date().isoformat()
        assert body["date"] == expected

    async def test_a_zone_the_server_cannot_resolve_is_refused_at_signup(
        self, client, unique_email
    ):
        """Better a 422 now than wrong times forever."""
        res = await client.post(
            "/auth/signup",
            json={
                "email": unique_email(),
                "password": "password123",
                "timezone": "Mars/Olympus_Mons",
            },
        )
        assert res.status_code == 422
