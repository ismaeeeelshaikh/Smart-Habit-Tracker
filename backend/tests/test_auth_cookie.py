"""The refresh cookie's SameSite policy.

Local development runs the API behind the Vite proxy, same-origin, where Lax is
right. A production frontend on a different site needs None, or browsers keep
the cookie off the refresh call and every session ends with its first access
token. None is only valid alongside Secure, and a logout has to clear the
cookie with the same attributes it was set with or the browser keeps it.
"""

import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings


def refresh_cookie_attributes(res) -> set[str]:
    """The attributes of the refresh_token Set-Cookie header, lowercased."""
    headers = [h for h in res.headers.get_list("set-cookie") if h.startswith("refresh_token=")]
    assert headers, f"no refresh_token cookie in {res.headers.get_list('set-cookie')}"
    return {part.strip().lower() for part in headers[-1].split(";")[1:]}


async def signup(client, email):
    res = await client.post("/auth/signup", json={"email": email, "password": "password123"})
    assert res.status_code == 201, res.text
    return res


@pytest.fixture
def production_cookie(monkeypatch):
    """The cross-site production setting: SameSite=None over HTTPS."""
    monkeypatch.setattr(settings, "COOKIE_SAMESITE", "none")
    monkeypatch.setattr(settings, "COOKIE_SECURE", True)


class TestConfiguration:
    def test_defaults_to_lax(self, monkeypatch):
        monkeypatch.delenv("COOKIE_SAMESITE", raising=False)

        assert Settings(_env_file=None).COOKIE_SAMESITE == "lax"

    def test_none_is_accepted_with_secure(self):
        configured = Settings(_env_file=None, COOKIE_SAMESITE="none", COOKIE_SECURE=True)

        assert configured.COOKIE_SAMESITE == "none"

    def test_none_without_secure_is_refused(self):
        """Browsers drop a SameSite=None cookie that is not Secure, silently."""
        with pytest.raises(ValidationError, match="COOKIE_SECURE=true"):
            Settings(_env_file=None, COOKIE_SAMESITE="none", COOKIE_SECURE=False)

    def test_the_value_is_case_insensitive(self):
        configured = Settings(_env_file=None, COOKIE_SAMESITE=" None ", COOKIE_SECURE=True)

        assert configured.COOKIE_SAMESITE == "none"

    def test_an_unknown_value_is_rejected(self):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, COOKIE_SAMESITE="sideways")

    def test_lax_and_strict_do_not_require_secure(self):
        for value in ("lax", "strict"):
            configured = Settings(_env_file=None, COOKIE_SAMESITE=value, COOKIE_SECURE=False)
            assert configured.COOKIE_SAMESITE == value


class TestIssuedCookie:
    async def test_local_default_is_lax(self, client, unique_email):
        attributes = refresh_cookie_attributes(await signup(client, unique_email()))

        assert "samesite=lax" in attributes
        assert "secure" not in attributes

    async def test_production_setting_is_none_and_secure(
        self, client, unique_email, production_cookie
    ):
        attributes = refresh_cookie_attributes(await signup(client, unique_email()))

        assert {"samesite=none", "secure", "httponly", "path=/"} <= attributes

    async def test_login_uses_the_same_policy(self, client, unique_email, production_cookie):
        email = unique_email()
        await signup(client, email)

        res = await client.post("/auth/login", json={"email": email, "password": "password123"})

        assert res.status_code == 200, res.text
        assert {"samesite=none", "secure"} <= refresh_cookie_attributes(res)


class TestLogoutClearsTheSameCookie:
    async def test_production_logout_repeats_none_and_secure(
        self, client, unique_email, production_cookie
    ):
        issued = refresh_cookie_attributes(await signup(client, unique_email()))

        cleared = refresh_cookie_attributes(await client.post("/auth/logout"))

        assert "max-age=0" in cleared
        # Everything that identifies the cookie must match what was issued;
        # only its lifetime differs.
        lifetime = lambda attrs: {a for a in attrs if a.startswith(("max-age", "expires"))}  # noqa: E731
        assert issued - lifetime(issued) == cleared - lifetime(cleared)

    async def test_local_logout_repeats_lax(self, client, unique_email):
        await signup(client, unique_email())

        cleared = refresh_cookie_attributes(await client.post("/auth/logout"))

        assert {"max-age=0", "samesite=lax", "httponly", "path=/"} <= cleared
        assert "secure" not in cleared
