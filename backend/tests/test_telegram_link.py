"""The account-linking flow, both halves.

/api/telegram/* is the user's side (JWT). /internal/telegram/* is the bot's side
(shared key). The interesting rules live at the seam: codes expire, are single
use, and one Telegram account maps to exactly one app account.
"""

from datetime import UTC, datetime, timedelta

import pytest_asyncio
from sqlalchemy.future import select

from app.core.config import settings
from app.db.models import TelegramLinkCode, User

INTERNAL_HEADERS = {"X-Internal-Key": settings.INTERNAL_API_KEY}


async def generate_code(client) -> dict:
    res = await client.post("/api/telegram/link")
    assert res.status_code == 201, res.text
    return res.json()


async def consume(client, code, chat_id="55501", username="ismaeel"):
    return await client.post(
        "/internal/telegram/consume-code",
        json={"code": code, "chat_id": chat_id, "telegram_username": username},
        headers=INTERNAL_HEADERS,
    )


class TestGenerateCode:
    async def test_a_code_is_issued_with_an_expiry_and_the_bot_name(self, auth_client):
        body = await generate_code(auth_client)

        assert len(body["code"]) == 8
        assert datetime.fromisoformat(body["expires_at"]) > datetime.now(UTC)
        assert "bot_username" in body

    async def test_the_code_avoids_easily_confused_characters(self, auth_client):
        body = await generate_code(auth_client)

        # 0/O and 1/I/L are the pairs people mistype when copying by eye.
        assert not set(body["code"]) & set("01OIL")

    async def test_generating_again_invalidates_the_previous_code(self, auth_client, db_session):
        first = await generate_code(auth_client)
        await generate_code(auth_client)

        res = await consume(auth_client, first["code"])

        assert res.json()["linked"] is False

    async def test_requires_authentication(self, client):
        assert (await client.post("/api/telegram/link")).status_code == 401


class TestLinkStatus:
    async def test_starts_unlinked(self, auth_client):
        body = (await auth_client.get("/api/telegram/link/status")).json()

        assert body == {"linked": False, "telegram_username": None}

    async def test_reports_linked_once_the_code_is_used(self, auth_client):
        code = (await generate_code(auth_client))["code"]
        await consume(auth_client, code, username="ismaeel")

        body = (await auth_client.get("/api/telegram/link/status")).json()

        assert body == {"linked": True, "telegram_username": "ismaeel"}

    async def test_requires_authentication(self, client):
        assert (await client.get("/api/telegram/link/status")).status_code == 401


class TestConsumeCode:
    async def test_a_valid_code_links_the_account(self, auth_client):
        code = (await generate_code(auth_client))["code"]

        res = await consume(auth_client, code)

        assert res.status_code == 200
        assert res.json()["linked"] is True

    async def test_the_code_is_single_use(self, auth_client):
        code = (await generate_code(auth_client))["code"]
        await consume(auth_client, code)

        second = await consume(auth_client, code, chat_id="99999")

        assert second.json()["linked"] is False

    async def test_an_expired_code_is_refused(self, auth_client, db_session):
        code = (await generate_code(auth_client))["code"]
        result = await db_session.execute(
            select(TelegramLinkCode).where(TelegramLinkCode.code == code)
        )
        row = result.scalars().one()
        row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await db_session.commit()

        res = await consume(auth_client, code)

        assert res.json()["linked"] is False
        assert "expired" in res.json()["detail"]

    async def test_an_unknown_code_is_refused_the_same_way_as_an_expired_one(self, auth_client):
        """Same wording either way, so the message can't be used to probe codes."""
        res = await consume(auth_client, "ZZZZZZZZ")

        assert res.json()["linked"] is False
        assert "expired" in res.json()["detail"]

    async def test_the_code_is_matched_case_insensitively(self, auth_client):
        code = (await generate_code(auth_client))["code"]

        res = await consume(auth_client, f"  {code.lower()}  ")

        assert res.json()["linked"] is True

    async def test_one_telegram_account_cannot_claim_two_app_accounts(
        self, auth_client, client, unique_email
    ):
        first_code = (await generate_code(auth_client))["code"]
        await consume(auth_client, first_code, chat_id="55501")

        # A second app account, same Telegram chat.
        res = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
        second_code = (await generate_code(client))["code"]

        outcome = await consume(client, second_code, chat_id="55501")

        assert outcome.json()["linked"] is False
        assert "already linked" in outcome.json()["detail"]

    async def test_rejects_a_missing_internal_key(self, auth_client):
        code = (await generate_code(auth_client))["code"]

        res = await auth_client.post(
            "/internal/telegram/consume-code",
            json={"code": code, "chat_id": "1", "telegram_username": None},
        )

        assert res.status_code == 401

    async def test_rejects_a_wrong_internal_key(self, auth_client):
        code = (await generate_code(auth_client))["code"]

        res = await auth_client.post(
            "/internal/telegram/consume-code",
            json={"code": code, "chat_id": "1", "telegram_username": None},
            headers={"X-Internal-Key": "not-the-key"},
        )

        assert res.status_code == 401


class TestChatLookup:
    async def test_an_unlinked_chat_is_a_404(self, auth_client):
        res = await auth_client.get(
            "/internal/telegram/user", params={"chat_id": "nobody"}, headers=INTERNAL_HEADERS
        )

        assert res.status_code == 404

    async def test_a_linked_chat_resolves(self, auth_client):
        code = (await generate_code(auth_client))["code"]
        await consume(auth_client, code, chat_id="4242", username="ismaeel")

        res = await auth_client.get(
            "/internal/telegram/user", params={"chat_id": "4242"}, headers=INTERNAL_HEADERS
        )

        assert res.status_code == 200
        assert res.json()["telegram_username"] == "ismaeel"

    async def test_requires_the_internal_key(self, auth_client):
        res = await auth_client.get("/internal/telegram/user", params={"chat_id": "4242"})

        assert res.status_code == 401


class TestDisconnect:
    @pytest_asyncio.fixture
    async def linked_client(self, auth_client):
        code = (await generate_code(auth_client))["code"]
        await consume(auth_client, code, chat_id="7777", username="ismaeel")
        return auth_client

    async def test_disconnecting_clears_the_link(self, linked_client):
        res = await linked_client.delete("/api/telegram/link")

        assert res.status_code == 200
        assert res.json()["linked"] is False
        assert (await linked_client.get("/api/telegram/link/status")).json()["linked"] is False

    async def test_the_chat_can_be_relinked_afterwards(self, linked_client):
        await linked_client.delete("/api/telegram/link")

        code = (await generate_code(linked_client))["code"]
        res = await consume(linked_client, code, chat_id="7777")

        assert res.json()["linked"] is True

    async def test_history_survives_disconnecting(self, linked_client, db_session):
        """Reminders belong to the account, not to the channel that delivered them."""
        created = await linked_client.post(
            "/api/reminders/",
            json={
                "label": "Stretch",
                "scheduled_time": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
        )
        assert created.status_code == 201

        await linked_client.delete("/api/telegram/link")

        listed = (await linked_client.get("/api/reminders/")).json()
        assert [r["label"] for r in listed] == ["Stretch"]

    async def test_requires_authentication(self, client):
        assert (await client.delete("/api/telegram/link")).status_code == 401


async def test_linking_is_visible_on_the_user_record(auth_client, db_session):
    code = (await generate_code(auth_client))["code"]
    await consume(auth_client, code, chat_id="31337", username="ismaeel")

    me = (await auth_client.get("/auth/me")).json()
    assert me["telegram_linked"] is True
    assert me["telegram_username"] == "ismaeel"

    result = await db_session.execute(select(User).where(User.telegram_chat_id == "31337"))
    assert result.scalars().first() is not None


class TestChatToken:
    """The bot swaps a linked chat id for a user token, then uses the normal API."""

    @pytest_asyncio.fixture
    async def linked_chat(self, auth_client):
        code = (await generate_code(auth_client))["code"]
        await consume(auth_client, code, chat_id="8080", username="ismaeel")
        return "8080"

    async def test_a_linked_chat_gets_a_working_token(self, auth_client, linked_chat):
        res = await auth_client.post(
            "/internal/telegram/token",
            json={"chat_id": linked_chat},
            headers=INTERNAL_HEADERS,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["expires_in"] > 0

        # The whole point: the token works on the ordinary, ownership-scoped API.
        me = await auth_client.get(
            "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        assert me.status_code == 200
        assert me.json()["telegram_username"] == "ismaeel"

    async def test_the_token_is_short_lived(self, auth_client, linked_chat):
        res = await auth_client.post(
            "/internal/telegram/token",
            json={"chat_id": linked_chat},
            headers=INTERNAL_HEADERS,
        )
        # Minutes, not the usual quarter hour — the bot re-mints freely.
        assert res.json()["expires_in"] <= 5 * 60

    async def test_an_unlinked_chat_gets_no_token(self, auth_client):
        res = await auth_client.post(
            "/internal/telegram/token",
            json={"chat_id": "not-linked"},
            headers=INTERNAL_HEADERS,
        )
        assert res.status_code == 404

    async def test_requires_the_internal_key(self, auth_client, linked_chat):
        res = await auth_client.post(
            "/internal/telegram/token", json={"chat_id": linked_chat}
        )
        assert res.status_code == 401
