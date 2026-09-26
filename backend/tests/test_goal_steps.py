"""Breaking a goal into steps, and naming today's step in the suggestion.

The model is mocked everywhere. The steps only change what a suggestion says,
never when it is sent.
"""

import pytest

from app.ai import goal_steps
from app.ai.goal_steps import MAX_STEPS, build_prompt, validate
from app.ai.groq import AIUnavailable
from app.api.endpoints import goals as goal_endpoints
from app.bot.formatting import format_suggestion
from app.dispatch.loop import build_message
from app.schemas.goal import current_step


async def make_goal(client, name="DSA", minutes=30):
    res = await client.post(
        "/api/goals/", json={"name": name, "priority": "high", "estimated_duration_minutes": minutes}
    )
    assert res.status_code == 201, res.text
    return res.json()


class TestTidying:
    def test_titles_keep_their_order(self):
        assert validate(["Arrays", "Strings", "Linked lists"]) == ["Arrays", "Strings", "Linked lists"]

    def test_numbering_and_bullets_are_stripped(self):
        assert validate(["1. Arrays", "- Strings", "3) Trees"]) == ["Arrays", "Strings", "Trees"]

    def test_repeats_are_dropped(self):
        assert validate(["Arrays", "arrays ", "Strings"]) == ["Arrays", "Strings"]

    def test_long_lists_and_titles_are_capped(self):
        steps = validate([f"Step {n} " + "x" * 200 for n in range(40)])

        assert len(steps) == MAX_STEPS
        assert all(len(s) <= 100 for s in steps)

    def test_something_that_is_not_a_list_gives_nothing(self):
        assert validate("do everything") == []

    def test_the_prompt_carries_the_goal_the_session_and_the_note(self):
        prompt = build_prompt("DSA", 30, "I know arrays")

        assert "DSA" in prompt and "30 minutes" in prompt and "I know arrays" in prompt


class TestProposing:
    async def test_too_few_steps_is_an_error_not_a_one_step_plan(self, monkeypatch):
        async def model(system, user, **kwargs):
            return {"steps": ["Learn everything"]}

        monkeypatch.setattr(goal_steps, "complete_json", model)

        with pytest.raises(AIUnavailable):
            await goal_steps.propose_steps("DSA", 30)


class TestTodaysStep:
    def test_it_is_the_first_one_not_done(self):
        steps = [{"title": "Arrays", "done": True}, {"title": "Strings", "done": False}]

        assert current_step(steps) == "Strings"

    def test_none_once_everything_is_done_or_there_are_none(self):
        assert current_step([{"title": "Arrays", "done": True}]) is None
        assert current_step([]) is None

    ALLOCATION = {"goal_name": "DSA", "minutes": 30, "start": "2026-09-28T17:00:00"}
    SLOT = {"duration_minutes": 60, "start": "2026-09-28T17:00:00"}

    def test_the_telegram_suggestion_names_it(self):
        text = build_message({**self.ALLOCATION, "current_step": "Strings"}, self.SLOT)

        assert "Suggested task: DSA — today: Strings" in text

    def test_without_steps_the_message_is_unchanged(self):
        assert "Suggested task: DSA\n" in build_message(self.ALLOCATION, self.SLOT)

    def test_the_bots_next_names_it_too(self):
        text = format_suggestion(
            {"slot": self.SLOT, "allocations": [{**self.ALLOCATION, "current_step": "Strings"}]}
        )

        assert "Suggested task: DSA — today: Strings" in text


class TestBreakdownEndpoint:
    async def test_it_proposes_without_saving(self, auth_client, monkeypatch):
        seen = {}

        async def fake(name, minutes, note):
            seen.update(name=name, minutes=minutes, note=note)
            return ["Arrays", "Strings", "Trees"]

        monkeypatch.setattr(goal_endpoints, "propose_steps", fake)
        goal = await make_goal(auth_client)

        res = await auth_client.post(f"/api/goals/{goal['id']}/breakdown", json={"note": "beginner"})

        assert res.status_code == 200, res.text
        assert res.json() == {"steps": ["Arrays", "Strings", "Trees"]}
        assert seen == {"name": "DSA", "minutes": 30, "note": "beginner"}
        stored = (await auth_client.get("/api/goals/")).json()[0]
        assert stored["steps"] == []

    async def test_someone_elses_goal_is_not_found(self, auth_client, client, unique_email, monkeypatch):
        async def fake(*args):
            raise AssertionError("should not have been called")

        monkeypatch.setattr(goal_endpoints, "propose_steps", fake)
        goal = await make_goal(auth_client)
        signup = await client.post(
            "/auth/signup", json={"email": unique_email(), "password": "password123"}
        )
        other = {"Authorization": f"Bearer {signup.json()['access_token']}"}

        res = await client.post(f"/api/goals/{goal['id']}/breakdown", json={}, headers=other)

        assert res.status_code == 404

    async def test_a_model_outage_is_a_503(self, auth_client, monkeypatch):
        async def fake(*args):
            raise AIUnavailable("The model is busy right now. Try again in a minute.")

        monkeypatch.setattr(goal_endpoints, "propose_steps", fake)
        goal = await make_goal(auth_client)

        res = await auth_client.post(f"/api/goals/{goal['id']}/breakdown", json={})

        assert res.status_code == 503


class TestSavingSteps:
    async def test_steps_are_saved_and_ticked_through_the_ordinary_update(self, auth_client):
        goal = await make_goal(auth_client)
        steps = [{"title": "Arrays", "done": False}, {"title": "Strings", "done": False}]

        await auth_client.put(f"/api/goals/{goal['id']}", json={"steps": steps})
        steps[0]["done"] = True
        res = await auth_client.put(f"/api/goals/{goal['id']}", json={"steps": steps})

        assert res.status_code == 200, res.text
        assert res.json()["steps"] == [
            {"title": "Arrays", "done": True},
            {"title": "Strings", "done": False},
        ]

    async def test_other_changes_leave_the_steps_alone(self, auth_client):
        goal = await make_goal(auth_client)
        await auth_client.put(f"/api/goals/{goal['id']}", json={"steps": [{"title": "Arrays"}]})

        res = await auth_client.put(f"/api/goals/{goal['id']}", json={"priority": "low"})

        assert res.json()["steps"] == [{"title": "Arrays", "done": False}]

    async def test_an_empty_title_is_refused(self, auth_client):
        goal = await make_goal(auth_client)

        res = await auth_client.put(f"/api/goals/{goal['id']}", json={"steps": [{"title": ""}]})

        assert res.status_code == 422

    async def test_more_than_thirty_steps_is_refused(self, auth_client):
        goal = await make_goal(auth_client)
        steps = [{"title": f"Step {n}"} for n in range(31)]

        res = await auth_client.put(f"/api/goals/{goal['id']}", json={"steps": steps})

        assert res.status_code == 422

    async def test_the_next_suggestion_carries_todays_step(self, auth_client):
        goal = await make_goal(auth_client)
        await auth_client.put(
            f"/api/goals/{goal['id']}",
            json={"steps": [{"title": "Arrays", "done": True}, {"title": "Strings"}]},
        )

        res = await auth_client.get("/api/slots/next")

        allocations = res.json()["allocations"]
        assert allocations, res.json()
        assert allocations[0]["current_step"] == "Strings"
