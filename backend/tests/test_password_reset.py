"""Forgot password: /auth/forgot-password and /auth/reset-password."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.api.endpoints import auth as auth_endpoints
from app.core.config import settings
from app.core.email import EmailError
from app.db.models import EmailVerificationCode

SENT = "If an account uses that email, a code is on its way."
WRONG = "That code isn't right or has expired. Check it, or send a new one."


@pytest.fixture
def reset_outbox(monkeypatch):
    sent: list[tuple[str, str]] = []

    async def fake_send(to: str, code: str) -> None:
        sent.append((to, code))

    monkeypatch.setattr(auth_endpoints, "send_password_reset_code", fake_send)
    return sent


async def make_account(client, email, password="password123"):
    res = await client.post("/auth/signup", json={"email": email, "password": password})
    assert res.status_code == 201, res.text
    return res


async def reset(client, email, code, new_password="newpassword9"):
    return await client.post(
        "/auth/reset-password",
        json={"email": email, "code": code, "new_password": new_password},
    )


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


class TestForgot:
    async def test_mails_a_code_to_a_known_address(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)

        res = await client.post("/auth/forgot-password", json={"email": email.upper()})

        assert res.status_code == 200
        assert res.json()["detail"] == SENT
        assert len(reset_outbox) == 1 and reset_outbox[0][0] == email

    async def test_an_unknown_address_gets_the_same_answer(self, client, unique_email, reset_outbox):
        res = await client.post("/auth/forgot-password", json={"email": unique_email()})

        assert res.status_code == 200
        assert res.json()["detail"] == SENT
        assert reset_outbox == []

    async def test_asking_twice_in_a_minute_sends_once(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)

        await client.post("/auth/forgot-password", json={"email": email})
        again = await client.post("/auth/forgot-password", json={"email": email})

        assert again.status_code == 200
        assert len(reset_outbox) == 1

    async def test_a_mail_failure_is_reported(self, client, unique_email, monkeypatch):
        email = unique_email()
        await make_account(client, email)

        async def broken(to: str, code: str) -> None:
            raise EmailError("down")

        monkeypatch.setattr(auth_endpoints, "send_password_reset_code", broken)
        res = await client.post("/auth/forgot-password", json={"email": email})
        assert res.status_code == 502


class TestReset:
    async def test_the_right_code_sets_the_new_password(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})

        res = await reset(client, email, reset_outbox[-1][1])
        assert res.status_code == 204, res.text

        old = await client.post("/auth/login", json={"email": email, "password": "password123"})
        new = await client.post("/auth/login", json={"email": email, "password": "newpassword9"})
        assert old.status_code == 401
        assert new.status_code == 200

    async def test_it_signs_out_every_device(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)
        # The signup left a refresh cookie on this client.
        await client.post("/auth/forgot-password", json={"email": email})
        await reset(client, email, reset_outbox[-1][1])

        assert (await client.post("/auth/refresh")).status_code == 401

    async def test_a_wrong_code_is_refused(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})

        res = await reset(client, email, wrong(reset_outbox[-1][1]))
        assert res.status_code == 400
        assert res.json()["detail"] == WRONG

    async def test_five_wrong_tries_lock_the_code(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})
        code = reset_outbox[-1][1]

        for _ in range(settings.EMAIL_CODE_MAX_ATTEMPTS):
            await reset(client, email, wrong(code))
        assert (await reset(client, email, code)).status_code == 400

    async def test_an_expired_code_is_refused(self, client, unique_email, reset_outbox, db_session):
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})
        await db_session.execute(
            update(EmailVerificationCode).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
        )

        assert (await reset(client, email, reset_outbox[-1][1])).status_code == 400

    async def test_an_unknown_email_looks_like_a_wrong_code(self, client, unique_email):
        res = await reset(client, unique_email(), "123456")
        assert res.status_code == 400
        assert res.json()["detail"] == WRONG

    async def test_a_weak_new_password_is_refused(self, client, unique_email, reset_outbox):
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})

        assert (await reset(client, email, reset_outbox[-1][1], "short")).status_code == 422

    async def test_a_signup_code_does_not_reset_a_password(
        self, client, unique_email, reset_outbox, monkeypatch
    ):
        verify_codes: list[tuple[str, str]] = []

        async def capture(to: str, code: str) -> None:
            verify_codes.append((to, code))

        monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
        monkeypatch.setattr(auth_endpoints, "send_verification_code", capture)
        email = unique_email()
        await make_account(client, email)

        assert (await reset(client, email, verify_codes[-1][1])).status_code == 400

    async def test_resetting_also_confirms_the_email(
        self, client, unique_email, reset_outbox, monkeypatch
    ):
        async def ignore(to: str, code: str) -> None:
            return None

        monkeypatch.setattr(settings, "EMAIL_VERIFICATION_REQUIRED", True)
        monkeypatch.setattr(auth_endpoints, "send_verification_code", ignore)
        email = unique_email()
        await make_account(client, email)
        await client.post("/auth/forgot-password", json={"email": email})
        await reset(client, email, reset_outbox[-1][1])

        login = await client.post("/auth/login", json={"email": email, "password": "newpassword9"})
        client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        assert (await client.get("/auth/me")).json()["email_verified"] is True
