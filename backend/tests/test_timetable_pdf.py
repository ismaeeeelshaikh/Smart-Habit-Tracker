"""Reading a college timetable PDF.

The grid is read by code and the model only chooses a subject per slot, so the
tests here pin the half that decides times: merged cells, breaks, and the
afternoon clock. The model is mocked throughout, and the tables are synthetic —
the same shape a real timetable extracts to, without anyone's real timetable.
"""

from datetime import time

import pytest

from app.ai import timetable_pdf
from app.ai.groq import AIUnavailable
from app.ai.schedule_draft import DraftBlock
from app.ai.timetable_pdf import Slot, TimetableUnreadable, _join_adjacent, slots_from_table
from app.api.endpoints import schedule as schedule_endpoints

HEADER = [
    "Time/Day", "8.10 - 9.05", "9.05 - 10.00", "10.00 -\n10.20", "10.20 - 11.15",
    "11.15 - 12.10", "12.10 -\n12.50", "12.50 - 1.45", "1.45-2.40",
]


def table(*days):
    return [["", None, None], ["SOME COLLEGE TIMETABLE", None, None], HEADER, *days]


def spans(slots):
    return [(s.day, f"{s.start:%H:%M}", f"{s.end:%H:%M}", s.text) for s in slots]


class TestGrid:
    def test_single_cells_become_their_period(self):
        rows = table(["MONDAY", "", "IOE (NJ)\n214", "SHORT\nBREAK", "IRS (SO)", "", "", "", ""])

        assert spans(slots_from_table(rows)) == [
            ("mon", "09:05", "10:00", "IOE (NJ) 214"),
            ("mon", "10:20", "11:15", "IRS (SO)"),
        ]

    def test_a_merged_cell_runs_until_its_last_period(self):
        """A two-hour lab is one cell followed by None for each period it covers."""
        rows = table(["MONDAY", "", "", "SHORT\nBREAK", "", "", "LONG\nBREAK", "DSL/IOE C1/C2", None])

        assert spans(slots_from_table(rows)) == [("mon", "12:50", "14:40", "DSL/IOE C1/C2")]

    def test_a_lab_never_runs_through_a_break(self):
        """The break is merged down every day, so other days hold None there too."""
        rows = table(
            ["MONDAY", "", "", "SHORT\nBREAK", "", "", "LONG\nBREAK", "", ""],
            ["TUESDAY", "IOE/DSL C1/C2", None, None, "IRS", "AI-DS-II", None, "", ""],
        )

        assert spans(slots_from_table(rows)) == [
            ("tue", "08:10", "10:00", "IOE/DSL C1/C2"),
            ("tue", "10:20", "11:15", "IRS"),
            ("tue", "11:15", "12:10", "AI-DS-II"),
        ]

    def test_afternoon_hours_are_read_as_afternoon(self):
        rows = table(["FRIDAY", "", "", "BREAK", "", "", "", "Project", None])

        (slot,) = slots_from_table(rows)
        assert slot.start == time(12, 50) and slot.end == time(14, 40)

    def test_rows_that_are_not_days_are_ignored(self):
        rows = table(["Subject", "ITC701", "", "", "", "", "", "", ""])

        assert slots_from_table(rows) == []

    def test_a_table_without_a_row_of_periods_yields_nothing(self):
        assert slots_from_table([["MONDAY", "IOE", "IRS"]]) == []


class TestJoining:
    def test_back_to_back_halves_of_one_thing_become_one_block(self):
        rows = [
            {"day": "fri", "label": "Project", "start": "12:50", "end": "14:40"},
            {"day": "fri", "label": "Project", "start": "14:40", "end": "16:30"},
        ]

        assert _join_adjacent(rows) == [
            {"day": "fri", "label": "Project", "start": "12:50", "end": "16:30"}
        ]

    def test_a_break_between_them_keeps_them_apart(self):
        rows = [
            {"day": "fri", "label": "Lab", "start": "08:10", "end": "10:00"},
            {"day": "fri", "label": "Lab", "start": "10:20", "end": "12:10"},
        ]

        assert len(_join_adjacent(rows)) == 2


GRID = [
    Slot("mon", time(9, 5), time(10, 0), "IOE (NJ)"),
    Slot("mon", time(12, 50), time(14, 40), "DSL/IOE/ROSPL C1/C2/C3"),
    Slot("mon", time(14, 40), time(15, 35), "IS / STQA"),
]


class TestChoosing:
    @pytest.fixture(autouse=True)
    def grid(self, monkeypatch):
        monkeypatch.setattr(timetable_pdf, "read_slots", lambda data: list(GRID))

    async def test_times_come_from_the_grid_not_the_model(self, monkeypatch):
        seen = {}

        async def model(system, user, **kwargs):
            seen["user"] = user
            return {"slots": {"1": "IOE", "2": "DSL lab", "3": None}}

        monkeypatch.setattr(timetable_pdf, "complete_json", model)

        blocks, skipped = await timetable_pdf.draft_from_pdf(b"%PDF", "C1, IS")

        assert [(b.label, b.start_time, b.end_time) for b in blocks] == [
            ("IOE", time(9, 5), time(10, 0)),
            ("DSL lab", time(12, 50), time(14, 40)),
        ]
        assert skipped == []
        assert "C1, IS" in seen["user"] and "12:50-14:40" in seen["user"]

    async def test_no_choices_never_reaches_the_model(self, monkeypatch):
        async def explode(*args, **kwargs):
            raise AssertionError("the model should not have been called")

        monkeypatch.setattr(timetable_pdf, "complete_json", explode)

        with pytest.raises(AIUnavailable, match="batch"):
            await timetable_pdf.draft_from_pdf(b"%PDF", "   ")

    async def test_nothing_matching_is_said_out_loud(self, monkeypatch):
        async def model(system, user, **kwargs):
            return {"slots": {"1": None, "2": None, "3": None}}

        monkeypatch.setattr(timetable_pdf, "complete_json", model)

        blocks, skipped = await timetable_pdf.draft_from_pdf(b"%PDF", "Z9")

        assert blocks == []
        assert "None of the slots matched" in skipped[0]

    async def test_a_nonsense_answer_is_refused(self, monkeypatch):
        async def model(system, user, **kwargs):
            return {"slots": "all of them"}

        monkeypatch.setattr(timetable_pdf, "complete_json", model)

        with pytest.raises(AIUnavailable):
            await timetable_pdf.draft_from_pdf(b"%PDF", "C1")


class TestReadingFiles:
    def test_something_that_is_not_a_pdf_is_refused_in_words(self):
        with pytest.raises(TimetableUnreadable, match="isn't a PDF"):
            timetable_pdf.read_slots(b"definitely not a pdf")


PDF_UPLOAD = {"file": ("timetable.pdf", b"%PDF-1.7 fake", "application/pdf")}


class TestEndpoint:
    async def test_it_returns_proposed_blocks(self, auth_client, monkeypatch):
        seen = {}

        async def fake(content, choices):
            seen["choices"] = choices
            return [DraftBlock("mon", "IOE", time(9, 5), time(10, 0))], []

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", fake)

        res = await auth_client.post(
            "/api/schedule/draft-pdf", files=PDF_UPLOAD, data={"choices": "C1, IS"}
        )

        assert res.status_code == 200, res.text
        assert res.json()["blocks"][0] == {
            "day_of_week": "mon",
            "label": "IOE",
            "start_time": "09:05:00",
            "end_time": "10:00:00",
        }
        assert seen["choices"] == "C1, IS"

    async def test_a_file_that_is_not_a_pdf_never_reaches_the_reader(self, auth_client, monkeypatch):
        async def explode(*args):
            raise AssertionError("should not have been read")

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", explode)

        res = await auth_client.post(
            "/api/schedule/draft-pdf",
            files={"file": ("photo.jpg", b"\xff\xd8\xff", "image/jpeg")},
            data={"choices": "C1"},
        )

        assert res.status_code == 422
        assert "isn't a PDF" in res.json()["detail"]

    async def test_an_unreadable_timetable_is_a_422_with_a_reason(self, auth_client, monkeypatch):
        async def fake(*args):
            raise TimetableUnreadable("I couldn't find a timetable grid in that PDF.")

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", fake)

        res = await auth_client.post(
            "/api/schedule/draft-pdf", files=PDF_UPLOAD, data={"choices": "C1"}
        )

        assert res.status_code == 422
        assert "couldn't find a timetable grid" in res.json()["detail"]

    async def test_a_model_outage_is_a_503(self, auth_client, monkeypatch):
        async def fake(*args):
            raise AIUnavailable("The model is busy right now. Try again in a minute.")

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", fake)

        res = await auth_client.post(
            "/api/schedule/draft-pdf", files=PDF_UPLOAD, data={"choices": "C1"}
        )

        assert res.status_code == 503

    async def test_an_oversized_file_is_refused(self, auth_client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "MAX_PDF_BYTES", 10)

        res = await auth_client.post(
            "/api/schedule/draft-pdf",
            files={"file": ("big.pdf", b"%PDF" + b"x" * 20, "application/pdf")},
            data={"choices": "C1"},
        )

        assert res.status_code == 413

    async def test_it_needs_a_logged_in_user(self, client):
        res = await client.post(
            "/api/schedule/draft-pdf", files=PDF_UPLOAD, data={"choices": "C1"}
        )

        assert res.status_code == 401
