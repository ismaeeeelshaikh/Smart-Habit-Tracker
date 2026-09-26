"""Suggesting goals that fit a person's week.

The model is mocked everywhere. What's tested is what the app does with its
answer — above all, that nothing it offers is something the scheduler could
never place, and that nothing is saved until the user adds it.
"""

from datetime import time

import pytest

from app.ai import goal_suggest
from app.ai.goal_suggest import GoalSuggestion, build_prompt, describe_free_time, validate
from app.ai.groq import AIUnavailable
from app.api.endpoints import goals as goal_endpoints
from app.services import FreeSlot


def row(name="Aptitude", priority="medium", minutes=20, reason="Placement tests"):
    return {"name": name, "priority": priority, "minutes": minutes, "reason": reason}


class TestValidation:
    def test_a_plain_suggestion_survives(self):
        kept, skipped = validate([row()], existing=[], longest_gap=60)

        assert kept == [GoalSuggestion("Aptitude", "medium", 20, "Placement tests")]
        assert skipped == []

    def test_a_goal_they_already_have_is_left_out_whatever_the_case(self):
        kept, skipped = validate([row(name="  dsa ")], existing=["DSA"], longest_gap=60)

        assert kept == []
        assert "already have" in skipped[0]

    def test_the_same_suggestion_twice_is_kept_once(self):
        kept, _ = validate([row(), row(name="APTITUDE")], existing=[], longest_gap=60)

        assert len(kept) == 1

    def test_a_session_longer_than_any_gap_is_left_out_with_the_reason(self):
        """The allocator could never place it, so offering it would be a lie."""
        kept, skipped = validate([row(minutes=90)], existing=[], longest_gap=45)

        assert kept == []
        assert "longest free gap is 45 min" in skipped[0]

    @pytest.mark.parametrize("minutes", [5, 121, "lots", None])
    def test_a_session_that_is_not_a_daily_habit_is_left_out(self, minutes):
        kept, _ = validate([row(minutes=minutes)], existing=[], longest_gap=240)

        assert kept == []

    def test_an_unknown_priority_becomes_medium_rather_than_failing(self):
        kept, _ = validate([row(priority="URGENT!!")], existing=[], longest_gap=60)

        assert kept[0].priority == "medium"

    def test_long_names_and_reasons_are_trimmed(self):
        kept, _ = validate([row(name="N" * 300, reason="R" * 500)], existing=[], longest_gap=60)

        assert len(kept[0].name) == 80
        assert len(kept[0].reason) == 160

    def test_at_most_five(self):
        rows = [row(name=f"Habit {n}") for n in range(9)]

        kept, _ = validate(rows, existing=[], longest_gap=60)

        assert len(kept) == 5

    def test_an_answer_that_is_not_a_list_is_refused(self):
        kept, skipped = validate("everything", existing=[], longest_gap=60)

        assert kept == [] and skipped


class TestFreeTime:
    WEEK = {
        "mon": [FreeSlot("mon", time(16, 0), time(18, 0))],
        "sat": [FreeSlot("sat", time(9, 0), time(21, 0))],
        "sun": [FreeSlot("sun", time(9, 0), time(21, 0))],
    }

    def test_it_reports_each_day_and_the_longest_gap(self):
        text, longest = describe_free_time(self.WEEK, quiet_days=set())

        assert "Monday: 120 min free, longest gap 120 min" in text
        assert longest == 720

    def test_quiet_days_are_not_time_a_habit_can_use(self):
        """Nothing is ever suggested on a quiet day, so its hours don't count."""
        text, longest = describe_free_time(self.WEEK, quiet_days={"sat", "sun"})

        assert longest == 120
        assert "Saturday: a quiet day" in text

    def test_the_prompt_carries_only_what_it_should(self):
        prompt = build_prompt("final year", ["DSA"], ["Gym", "IOE"], "Monday: 120 min free")

        assert "final year" in prompt and "DSA" in prompt and "Gym, IOE" in prompt
        assert "Monday: 120 min free" in prompt

    def test_saying_nothing_is_allowed(self):
        assert "(nothing given)" in build_prompt("   ", [], [], "")


class TestSuggest:
    WEEK = {"mon": [FreeSlot("mon", time(16, 0), time(17, 0))]}

    async def test_the_model_answer_is_checked_before_anyone_sees_it(self, monkeypatch):
        async def model(system, user, **kwargs):
            return {"goals": [row(minutes=30), row(name="Marathon training", minutes=90)]}

        monkeypatch.setattr(goal_suggest, "complete_json", model)

        kept, skipped = await goal_suggest.suggest_goals("", [], [], self.WEEK, set())

        assert [g.name for g in kept] == ["Aptitude"]
        assert "Marathon training" in skipped[0]

    async def test_a_week_with_no_room_never_reaches_the_model(self, monkeypatch):
        async def explode(*args, **kwargs):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(goal_suggest, "complete_json", explode)

        with pytest.raises(AIUnavailable, match="no free gap"):
            await goal_suggest.suggest_goals("", [], [], {"mon": []}, set())


class TestEndpoint:
    async def test_it_suggests_without_saving_anything(self, auth_client, monkeypatch):
        seen = {}

        async def fake(about, existing, labels, week, quiet_days):
            seen.update(about=about, existing=existing, quiet_days=quiet_days)
            return [GoalSuggestion("Aptitude", "medium", 20, "Placement tests")], []

        monkeypatch.setattr(goal_endpoints, "suggest_goals", fake)
        await auth_client.post(
            "/api/goals/", json={"name": "DSA", "priority": "high", "estimated_duration_minutes": 30}
        )
        await auth_client.patch("/api/users/me/preferences", json={"quiet_days": ["sun"]})

        res = await auth_client.post("/api/goals/suggest", json={"about": "final year"})

        assert res.status_code == 200, res.text
        assert res.json() == {
            "suggestions": [
                {
                    "name": "Aptitude",
                    "priority": "medium",
                    "estimated_duration_minutes": 20,
                    "reason": "Placement tests",
                }
            ],
            "skipped": [],
        }
        assert seen == {"about": "final year", "existing": ["DSA"], "quiet_days": {"sun"}}
        goals = (await auth_client.get("/api/goals/")).json()
        assert [g["name"] for g in goals] == ["DSA"]

    async def test_about_is_optional(self, auth_client, monkeypatch):
        async def fake(*args):
            return [], []

        monkeypatch.setattr(goal_endpoints, "suggest_goals", fake)

        res = await auth_client.post("/api/goals/suggest", json={})

        assert res.status_code == 200

    async def test_a_model_outage_is_a_503_the_ui_can_read_out(self, auth_client, monkeypatch):
        async def fake(*args):
            raise AIUnavailable("The model is busy right now. Try again in a minute.")

        monkeypatch.setattr(goal_endpoints, "suggest_goals", fake)

        res = await auth_client.post("/api/goals/suggest", json={"about": ""})

        assert res.status_code == 503
        assert res.json()["detail"] == "The model is busy right now. Try again in a minute."

    async def test_it_needs_a_logged_in_user(self, client):
        res = await client.post("/api/goals/suggest", json={"about": ""})

        assert res.status_code == 401
