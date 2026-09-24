"""Reading a described week into schedule rows.

The model is mocked everywhere here. What is being tested is what happens to
its answer: a wrong block entering someone's schedule silently spoils every
suggestion afterwards, so anything that fails a check has to be dropped with a
reason rather than guessed at — and nothing at all may be saved until the user
says yes.
"""

from datetime import time

import pytest

from app.ai import schedule_draft
from app.ai.groq import AIUnavailable
from app.ai.schedule_draft import MAX_BLOCKS, validate


def row(day="mon", label="College", start="09:00", end="15:00"):
    return {"day": day, "label": label, "start": start, "end": end}


class TestValidation:
    def test_a_plain_row_survives(self):
        blocks, skipped = validate([row()])

        assert skipped == []
        assert blocks[0].day_of_week == "mon"
        assert blocks[0].start_time == time(9, 0)
        assert blocks[0].end_time == time(15, 0)

    def test_seconds_and_single_digit_hours_are_read(self):
        blocks, _ = validate([row(start="9:00", end="15:00:00")])

        assert blocks[0].start_time == time(9, 0)

    def test_a_day_it_invented_is_dropped(self):
        blocks, skipped = validate([row(day="someday")])

        assert blocks == []
        assert "no day I recognised" in skipped[0]

    def test_an_unreadable_time_is_dropped(self):
        blocks, skipped = validate([row(start="whenever")])

        assert blocks == []
        assert "couldn't read the times" in skipped[0]

    def test_a_block_that_ends_before_it_starts_is_dropped(self):
        blocks, skipped = validate([row(start="15:00", end="09:00")])

        assert blocks == []
        assert "ends before it starts" in skipped[0]

    def test_an_overlapping_block_is_dropped_and_named(self):
        """Two commitments at once is a misreading, not a schedule."""
        blocks, skipped = validate([row(), row(label="Gym", start="10:00", end="11:00")])

        assert [b.label for b in blocks] == ["College"]
        assert "overlaps College" in skipped[0]

    def test_the_same_time_on_another_day_is_not_an_overlap(self):
        blocks, skipped = validate([row(), row(day="tue")])

        assert len(blocks) == 2
        assert skipped == []

    def test_touching_blocks_are_not_an_overlap(self):
        blocks, _ = validate([row(start="09:00", end="10:00"), row(label="Lab", start="10:00", end="11:00")])

        assert len(blocks) == 2

    def test_a_nameless_block_is_dropped(self):
        blocks, skipped = validate([row(label="  ")])

        assert blocks == []
        assert "no name" in skipped[0]

    def test_a_long_label_is_trimmed_rather_than_refused(self):
        blocks, _ = validate([row(label="L" * 200)])

        assert len(blocks[0].label) == 100

    def test_an_answer_that_is_not_a_list_is_refused(self):
        blocks, skipped = validate({"blocks": "all of them"})

        assert blocks == []
        assert skipped

    def test_a_runaway_answer_is_capped(self):
        many = [row(day="mon", label=f"B{i}", start="00:00", end="00:01") for i in range(MAX_BLOCKS + 10)]

        blocks, skipped = validate(many)

        assert len(blocks) <= MAX_BLOCKS
        assert any("first" in s for s in skipped)


class TestDraftFromText:
    async def test_it_passes_the_description_to_the_model(self, monkeypatch):
        seen = {}

        async def fake_complete(system, user, **kwargs):
            seen["system"], seen["user"] = system, user
            return {"blocks": [row()]}

        monkeypatch.setattr(schedule_draft, "complete_json", fake_complete)

        blocks, skipped = await schedule_draft.draft_from_text("  Mon college 9 to 3  ")

        assert seen["user"] == "Mon college 9 to 3"
        assert "mon" in seen["system"]
        assert len(blocks) == 1 and skipped == []

    async def test_an_empty_description_never_reaches_the_model(self, monkeypatch):
        async def explode(*args, **kwargs):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(schedule_draft, "complete_json", explode)

        with pytest.raises(AIUnavailable):
            await schedule_draft.draft_from_text("   ")

    async def test_finding_nothing_is_said_out_loud(self, monkeypatch):
        async def fake_complete(system, user, **kwargs):
            return {"blocks": []}

        monkeypatch.setattr(schedule_draft, "complete_json", fake_complete)

        blocks, skipped = await schedule_draft.draft_from_text("hello there")

        assert blocks == []
        assert skipped and "couldn't find any commitments" in skipped[0]
