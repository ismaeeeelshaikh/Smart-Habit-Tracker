"""Cross-user access must never succeed — Backend Schema Document Section 5.1."""

import pytest_asyncio


@pytest_asyncio.fixture
async def other_users_goal_and_block(client, unique_email):
    """Create a goal + schedule block owned by user A, then drop A's token."""
    res = await client.post(
        "/auth/signup", json={"email": unique_email(), "password": "password123"}
    )
    client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"

    goal = await client.post(
        "/api/goals/",
        json={"name": "Private goal", "priority": "high", "estimated_duration_minutes": 30},
    )
    block = await client.post(
        "/api/schedule/",
        json={
            "day_of_week": "mon",
            "label": "Private block",
            "is_flexible_block": False,
            "start_time": "09:00:00",
            "end_time": "10:00:00",
        },
    )
    client.headers.pop("Authorization")
    return goal.json()["id"], block.json()["id"]


async def test_user_cannot_read_another_users_goals(other_users_goal_and_block, auth_client):
    res = await auth_client.get("/api/goals/")
    assert res.status_code == 200
    assert res.json() == []


async def test_user_cannot_read_another_users_schedule(other_users_goal_and_block, auth_client):
    res = await auth_client.get("/api/schedule/")
    assert res.status_code == 200
    assert res.json() == []


async def test_user_cannot_update_another_users_goal(other_users_goal_and_block, auth_client):
    goal_id, _ = other_users_goal_and_block
    res = await auth_client.put(f"/api/goals/{goal_id}", json={"name": "hijacked"})
    assert res.status_code == 404


async def test_user_cannot_delete_another_users_goal(other_users_goal_and_block, auth_client):
    goal_id, _ = other_users_goal_and_block
    assert (await auth_client.delete(f"/api/goals/{goal_id}")).status_code == 404


async def test_user_cannot_update_another_users_block(other_users_goal_and_block, auth_client):
    _, block_id = other_users_goal_and_block
    res = await auth_client.put(f"/api/schedule/{block_id}", json={"label": "hijacked"})
    assert res.status_code == 404


async def test_user_cannot_delete_another_users_block(other_users_goal_and_block, auth_client):
    _, block_id = other_users_goal_and_block
    assert (await auth_client.delete(f"/api/schedule/{block_id}")).status_code == 404


async def test_protected_routes_reject_anonymous_callers(client):
    for path in ("/api/goals/", "/api/schedule/"):
        assert (await client.get(path)).status_code == 401
