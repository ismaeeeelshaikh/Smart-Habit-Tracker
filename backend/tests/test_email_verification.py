"""Signup email codes: /auth/verify-email, /auth/resend-verification, and the /api gate."""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import update

from app.api.endpoints import auth as auth_endpoints
from app.core.config import settings
from app.core.email import EmailError
from app.db.models import EmailVerificationCode


@pytest.fixture
def outbox(monkeypatch):
    """Turn verification on and catch the codes instead of mailing them."""
    sent: list[tuple[str, str]] = []

    async def fake_send(to: str, code: str) -> None:
        sent.append((to, code))

    monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
    monkeypatch.setattr(auth_endpoints, "send_verification_code", fake_send)
    return sent


@pytest_asyncio.fixture
async def new_user(client, unique_email, outbox):
    """Signed up with verification on; not verified yet."""
    email = unique_email()
    res = await client.post("/auth/signup", json={"email": email, "password": "password123"})
    assert res.status_code == 201, res.text
    client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
    return client, email


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


class TestSignup:
    async def test_a_code_is_mailed_to_the_new_address(self, new_user, outbox):
        _, email = new_user
        assert len(outbox) == 1
        to, code = outbox[0]
        assert to == email
        assert len(code) == 6 and code.isdigit()

    async def test_the_account_starts_unverified(self, new_user):
        client, _ = new_user
        assert (await client.get("/auth/me")).json()["email_verified"] is False

    async def test_the_app_stays_closed_until_verified(self, new_user):
        client, _ = new_user
        res = await client.get("/api/goals/")
        assert res.status_code == 403
        assert res.json()["detail"] == "Email not verified"

    async def test_a_mail_failure_does_not_lose_the_account(self, client, unique_email, monkeypatch):
        async def broken(to: str, code: str) -> None:
            raise EmailError("service down")

        monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
        monkeypatch.setattr(auth_endpoints, "send_verification_code", broken)

        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        assert res.status_code == 201, res.text

    async def test_with_verification_off_the_account_is_ready_at_once(self, auth_client):
        # The default: nothing is mailed and nothing is gated.
        assert settings.EMAIL_VERIFICATION_REQUIRED is False
        assert (await auth_client.get("/auth/me")).json()["email_verified"] is True
        assert (await auth_client.get("/api/goals/")).status_code == 200


class TestVerify:
    async def test_the_right_code_opens_the_app(self, new_user, outbox):
        client, _ = new_user
        res = await client.post("/auth/verify-email", json={"code": outbox[-1][1]})

        assert res.status_code == 200, res.text
        assert res.json()["email_verified"] is True
        assert (await client.get("/api/goals/")).status_code == 200

    async def test_spaces_around_the_code_are_ignored(self, new_user, outbox):
        client, _ = new_user
        res = await client.post("/auth/verify-email", json={"code": f" {outbox[-1][1]} "})
        assert res.status_code == 200, res.text

    async def test_a_wrong_code_says_how_many_tries_are_left(self, new_user, outbox):
        client, _ = new_user
        res = await client.post("/auth/verify-email", json={"code": wrong(outbox[-1][1])})

        assert res.status_code == 400
        assert res.json()["detail"] == "That code isn't right. 4 tries left."

    async def test_too_many_wrong_tries_lock_the_code(self, new_user, outbox):
        client, _ = new_user
        code = outbox[-1][1]
        for _ in range(settings.EMAIL_CODE_MAX_ATTEMPTS):
            await client.post("/auth/verify-email", json={"code": wrong(code)})

        # Even the right code is refused now; a new one has to be sent.
        res = await client.post("/auth/verify-email", json={"code": code})
        assert res.status_code == 400
        assert res.json()["detail"] == "Too many wrong tries. Send a new code."

    async def test_an_expired_code_is_refused(self, new_user, outbox, db_session):
        client, _ = new_user
        await db_session.execute(
            update(EmailVerificationCode).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )

        res = await client.post("/auth/verify-email", json={"code": outbox[-1][1]})
        assert res.status_code == 400
        assert res.json()["detail"] == "That code has expired. Send a new one."

    async def test_one_accounts_code_does_not_verify_another(self, client, unique_email, outbox):
        first = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        second = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        first_code = outbox[0][1]

        client.headers["Authorization"] = f"Bearer {second.json()['access_token']}"
        res = await client.post("/auth/verify-email", json={"code": first_code})
        # Almost certainly different codes; if they collide the hash still differs by user.
        assert res.status_code == 400
        assert first.status_code == 201

    async def test_requires_authentication(self, client):
        assert (await client.post("/auth/verify-email", json={"code": "123456"})).status_code == 401


class TestResend:
    async def test_a_new_code_waits_for_the_cooldown(self, new_user):
        client, _ = new_user
        res = await client.post("/auth/resend-verification")

        assert res.status_code == 429
        assert res.json()["detail"].startswith("Wait ")

    async def test_after_the_cooldown_a_new_code_replaces_the_old(self, new_user, outbox, db_session):
        client, _ = new_user
        old = outbox[-1][1]
        await db_session.execute(
            update(EmailVerificationCode).values(
                created_at=datetime.now(UTC) - timedelta(seconds=settings.EMAIL_CODE_RESEND_SECONDS + 1)
            )
        )

        res = await client.post("/auth/resend-verification")
        assert res.status_code == 204, res.text
        assert len(outbox) == 2
        new = outbox[-1][1]

        if new != old:
            assert (await client.post("/auth/verify-email", json={"code": old})).status_code == 400
        assert (await client.post("/auth/verify-email", json={"code": new})).status_code == 200


    async def test_a_failed_send_is_reported_not_hidden(self, new_user, db_session, monkeypatch):
        client, _ = new_user

        async def broken(to: str, code: str) -> None:
            raise EmailError("mail service answered 400: account not activated")

        monkeypatch.setattr(auth_endpoints, "send_verification_code", broken)
        await db_session.execute(
            update(EmailVerificationCode).values(
                created_at=datetime.now(UTC) - timedelta(seconds=settings.EMAIL_CODE_RESEND_SECONDS + 1)
            )
        )

        res = await client.post("/auth/resend-verification")

        assert res.status_code == 502
        assert res.json()["detail"] == "We couldn't send the email just now. Try again in a minute."
