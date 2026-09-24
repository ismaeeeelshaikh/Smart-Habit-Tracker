"""POST /api/schedule/draft and /api/schedule/bulk.

Draft proposes and saves nothing; bulk saves a reviewed draft all at once. The
model is mocked: no test here may touch the network.
"""

from sqlalchemy import func, select

from app.ai.groq import AIUnavailable
from app.api.endpoints import schedule as schedule_endpoints
from app.db.models import ScheduleBlock

DESCRIBED = {"text": "Mon to Tue college 9 to 3, gym Tuesday 6pm to 7pm"}


def answer(blocks):
    async def _draft(text):
        return blocks, []

    return _draft


async def count_blocks(db_session) -> int:
    return await db_session.scalar(select(func.count()).select_from(ScheduleBlock))


class FakeDraft:
    def __init__(self, day, label, start, end):
        self.day_of_week, self.label, self.start_time, self.end_time = day, label, start, end

    def as_dict(self):
        return {
            "day_of_week": self.day_of_week,
            "label": self.label,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }


class TestDraft:
    async def test_it_returns_proposed_blocks_without_saving_them(
        self, auth_client, db_session, monkeypatch
    ):
        monkeypatch.setattr(
            schedule_endpoints,
            "draft_from_text",
            answer([FakeDraft("mon", "College", "09:00:00", "15:00:00")]),
        )
        before = await count_blocks(db_session)

        res = await auth_client.post("/api/schedule/draft", json=DESCRIBED)

        assert res.status_code == 200, res.text
        assert res.json()["blocks"] == [
            {
                "day_of_week": "mon",
                "label": "College",
                "start_time": "09:00:00",
                "end_time": "15:00:00",
            }
        ]
        assert await count_blocks(db_session) == before

    async def test_what_was_dropped_comes_back_with_it(self, auth_client, monkeypatch):
        async def _draft(text):
            return [], ["Skipped Gym: I couldn't read the times."]

        monkeypatch.setattr(schedule_endpoints, "draft_from_text", _draft)

        res = await auth_client.post("/api/schedule/draft", json=DESCRIBED)

        assert res.status_code == 200
        assert res.json()["skipped"] == ["Skipped Gym: I couldn't read the times."]

    async def test_a_model_outage_is_a_503_the_ui_can_read_out(
        self, auth_client, monkeypatch
    ):
        async def _draft(text):
            raise AIUnavailable("The model is busy right now. Try again in a minute.")

        monkeypatch.setattr(schedule_endpoints, "draft_from_text", _draft)

        res = await auth_client.post("/api/schedule/draft", json=DESCRIBED)

        assert res.status_code == 503
        assert res.json()["detail"] == "The model is busy right now. Try again in a minute."

    async def test_it_needs_a_logged_in_user(self, client, monkeypatch):
        async def explode(text):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(schedule_endpoints, "draft_from_text", explode)

        res = await client.post("/api/schedule/draft", json=DESCRIBED)

        assert res.status_code == 401

    async def test_an_empty_description_is_refused_before_the_model(
        self, auth_client, monkeypatch
    ):
        async def explode(text):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(schedule_endpoints, "draft_from_text", explode)

        res = await auth_client.post("/api/schedule/draft", json={"text": ""})

        assert res.status_code == 422


class TestBulkSave:
    def block(self, day="mon", label="College", start="09:00:00", end="15:00:00", **extra):
        return {
            "day_of_week": day,
            "label": label,
            "start_time": start,
            "end_time": end,
            "is_flexible_block": False,
            **extra,
        }

    async def test_a_reviewed_draft_is_saved_in_one_go(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/bulk",
            json={"blocks": [self.block(), self.block(day="tue", label="Gym")]},
        )

        assert res.status_code == 201, res.text
        assert {b["label"] for b in res.json()} == {"College", "Gym"}

        listed = await auth_client.get("/api/schedule/")
        assert len(listed.json()) == 2

    async def test_the_reminder_lead_time_survives(self, auth_client):
        res = await auth_client.post(
            "/api/schedule/bulk", json={"blocks": [self.block(remind_before_minutes=10)]}
        )

        assert res.json()[0]["remind_before_minutes"] == 10

    async def test_one_bad_block_saves_none_of_them(self, auth_client, db_session):
        """Half a timetable is worse than none: the user can't see which half."""
        before = await count_blocks(db_session)

        res = await auth_client.post(
            "/api/schedule/bulk",
            json={"blocks": [self.block(), self.block(start="15:00:00", end="09:00:00")]},
        )

        assert res.status_code == 400
        assert await count_blocks(db_session) == before

    async def test_it_needs_a_logged_in_user(self, client):
        res = await client.post("/api/schedule/bulk", json={"blocks": [self.block()]})

        assert res.status_code == 401
