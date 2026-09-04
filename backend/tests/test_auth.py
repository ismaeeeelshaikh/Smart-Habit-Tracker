import pytest
from sqlalchemy.future import select

from app.api.endpoints.auth import hash_token
from app.db.models import RefreshToken


async def test_signup_issues_token_and_refresh_cookie(client, unique_email):
    res = await client.post(
        "/auth/signup",
        json={"email": unique_email(), "password": "password123", "timezone": "UTC"},
    )
    assert res.status_code == 201
    assert res.json()["access_token"]
    assert "refresh_token" in res.cookies


async def test_signup_rejects_duplicate_email_case_insensitively(client, unique_email):
    email = unique_email()
    first = await client.post(
        "/auth/signup", json={"email": email, "password": "password123"}
    )
    assert first.status_code == 201

    second = await client.post(
        "/auth/signup", json={"email": email.upper(), "password": "password123"}
    )
    assert second.status_code == 409


@pytest.mark.parametrize("password", ["short1", "nodigitshere"])
async def test_signup_rejects_weak_passwords(client, unique_email, password):
    res = await client.post(
        "/auth/signup", json={"email": unique_email(), "password": password}
    )
    assert res.status_code == 422


async def test_login_succeeds_and_rejects_bad_credentials(client, unique_email):
    email = unique_email()
    await client.post("/auth/signup", json={"email": email, "password": "password123"})

    ok = await client.post("/auth/login", json={"email": email, "password": "password123"})
    assert ok.status_code == 200

    bad = await client.post("/auth/login", json={"email": email, "password": "wrongpass1"})
    assert bad.status_code == 401


async def test_me_returns_identity_and_onboarding_state(auth_client):
    res = await auth_client.get("/auth/me")
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == auth_client.test_email
    assert body["onboarding_completed_at"] is None
    assert body["telegram_linked"] is False


async def test_me_requires_a_token(client):
    assert (await client.get("/auth/me")).status_code == 401


async def test_refresh_rotates_the_token(client, unique_email, db_session):
    signup = await client.post(
        "/auth/signup", json={"email": unique_email(), "password": "password123"}
    )
    original = signup.cookies["refresh_token"]

    refreshed = await client.post("/auth/refresh")
    assert refreshed.status_code == 200
    rotated = refreshed.cookies["refresh_token"]
    assert rotated != original

    old_row = (
        await db_session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(original))
        )
    ).scalars().first()
    assert old_row.revoked_at is not None
    assert old_row.replaced_by_token_id is not None


async def test_refresh_reuse_revokes_every_session(client, unique_email):
    signup = await client.post(
        "/auth/signup", json={"email": unique_email(), "password": "password123"}
    )
    original = signup.cookies["refresh_token"]

    assert (await client.post("/auth/refresh")).status_code == 200

    # Present the already-rotated token again — this is the leak signal.
    reused = await client.post("/auth/refresh", cookies={"refresh_token": original})
    assert reused.status_code == 401
    assert "reuse" in reused.json()["detail"].lower()

    # The rotated token must be dead too, not just the replayed one.
    assert (await client.post("/auth/refresh")).status_code == 401


async def test_logout_revokes_the_refresh_token(client, unique_email):
    await client.post(
        "/auth/signup", json={"email": unique_email(), "password": "password123"}
    )
    assert (await client.post("/auth/logout")).status_code == 200
    assert (await client.post("/auth/refresh")).status_code == 401


async def test_change_password_requires_the_current_one(auth_client):
    wrong = await auth_client.post(
        "/auth/change-password",
        json={"current_password": "notmypassword1", "new_password": "brandnew1234"},
    )
    assert wrong.status_code == 400

    ok = await auth_client.post(
        "/auth/change-password",
        json={"current_password": "password123", "new_password": "brandnew1234"},
    )
    assert ok.status_code == 204

    login = await auth_client.post(
        "/auth/login",
        json={"email": auth_client.test_email, "password": "brandnew1234"},
    )
    assert login.status_code == 200


async def test_complete_onboarding_is_idempotent(auth_client):
    first = await auth_client.post("/api/users/me/complete-onboarding")
    assert first.status_code == 200
    stamp = first.json()["onboarding_completed_at"]
    assert stamp is not None

    second = await auth_client.post("/api/users/me/complete-onboarding")
    assert second.json()["onboarding_completed_at"] == stamp
