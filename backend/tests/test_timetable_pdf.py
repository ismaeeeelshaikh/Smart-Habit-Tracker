"""Reading a college timetable PDF — no model involved.

The tests pin what decides a block: merged cells, breaks, the afternoon clock,
and how a crowded cell becomes a readable label. The tables are synthetic —
the same shape a real timetable extracts to, without anyone's real timetable.
"""

from datetime import time

import pytest

from app.ai import timetable_pdf
from app.ai.schedule_draft import DraftBlock
from app.ai.timetable_pdf import Slot, TimetableUnreadable, _join_adjacent, label_for, slots_from_table
from app.api.endpoints import schedule as schedule_endpoints

HEADER = [
    "Time/Day", "8.10 - 9.05", "9.05 - 10.00", "10.00 -\n10.20", "10.20 - 11.15",
    "11.15 - 12.10", "12.10 -\n12.50", "12.50 - 1.45", "1.45-2.40",
]


def table(*days):
    return [["", None, None], ["SOME COLLEGE TIMETABLE", None, None], HEADER, *days]


def spans(slots):
    return [(s.day, f"{s.start:%H:%M}", f"{s.end:%H:%M}") for s in slots]


class TestGrid:
    def test_single_cells_become_their_period(self):
        rows = table(["MONDAY", "", "IOE (NJ)\n214", "SHORT\nBREAK", "IRS (SO)", "", "", "", ""])

        assert spans(slots_from_table(rows)) == [("mon", "09:05", "10:00"), ("mon", "10:20", "11:15")]

    def test_a_merged_cell_runs_until_its_last_period(self):
        """A two-hour lab is one cell followed by None for each period it covers."""
        rows = table(["MONDAY", "", "", "SHORT\nBREAK", "", "", "LONG\nBREAK", "DSL/IOE\nC1/C2", None])

        assert spans(slots_from_table(rows)) == [("mon", "12:50", "14:40")]

    def test_a_lab_never_runs_through_a_break(self):
        """The break is merged down every day, so other days hold None there too."""
        rows = table(
            ["MONDAY", "", "", "SHORT\nBREAK", "", "", "LONG\nBREAK", "", ""],
            ["TUESDAY", "IOE/DSL\nC1/C2", None, None, "IRS", "AI-DS-II", None, "", ""],
        )

        assert spans(slots_from_table(rows)) == [
            ("tue", "08:10", "10:00"),
            ("tue", "10:20", "11:15"),
            ("tue", "11:15", "12:10"),
        ]

    def test_afternoon_hours_are_read_as_afternoon(self):
        rows = table(["FRIDAY", "", "", "BREAK", "", "", "", "Project", None])

        (slot,) = slots_from_table(rows)
        assert slot.start == time(12, 50) and slot.end == time(14, 40)

    def test_rows_that_are_not_days_are_ignored(self):
        assert slots_from_table(table(["Subject", "ITC701", "", "", "", "", "", "", ""])) == []

    def test_a_table_without_a_row_of_periods_yields_nothing(self):
        assert slots_from_table([["MONDAY", "IOE", "IRS"]]) == []


class TestLabels:
    @pytest.mark.parametrize(
        ("cell", "label"),
        [
            ("IOE (NJ)\n214", "IOE"),
            ("DSL(PV-304C)/ IOE(CS-301)/ ROSPL (SK-317)\nC1/C2/C3", "DSL / IOE / ROSPL lab"),
            ("IS (D2-RRK-213)\nSTQA (SMJ-422)", "IS / STQA"),
            ("ILO: CSL (VY-I2-206)\nMIS (SK-101)", "CSL / MIS"),
            ("HONOR\nCS (SD- 213)\nAI-ML (VJ- 214)", "Honors: CS / AI-ML"),
            ("HONOR\nCS LAB (MK- 405)\nAIML LAB (UNP-208)", "Honors: CS LAB / AIML LAB"),
            ("MAJOR PROJECT- I\n422", "MAJOR PROJECT- I"),
            ("Mentoring", "Mentoring"),
        ],
    )
    def test_rooms_teachers_and_batch_codes_are_dropped(self, cell, label):
        assert label_for(cell) == label

    def test_a_very_long_cell_is_trimmed(self):
        assert len(label_for(" / ".join(["SUBJECT"] * 40))) == 100


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


class TestDraft:
    def test_every_option_is_kept_for_the_user_to_prune(self, monkeypatch):
        monkeypatch.setattr(
            timetable_pdf,
            "read_slots",
            lambda data: [
                Slot("mon", time(12, 50), time(14, 40), "DSL (PV)/ IOE (CS)\nC1/C2"),
                Slot("tue", time(13, 45), time(14, 40), "STQA (SMJ-206)"),
            ],
        )

        blocks, skipped = timetable_pdf.draft_from_pdf(b"%PDF")

        assert [(b.day_of_week, b.label) for b in blocks] == [("mon", "DSL / IOE lab"), ("tue", "STQA")]
        assert skipped == []

    def test_something_that_is_not_a_pdf_is_refused_in_words(self):
        with pytest.raises(TimetableUnreadable, match="isn't a PDF"):
            timetable_pdf.read_slots(b"definitely not a pdf")


PDF_UPLOAD = {"file": ("timetable.pdf", b"%PDF-1.7 fake", "application/pdf")}


class TestEndpoint:
    async def test_it_returns_proposed_blocks(self, auth_client, monkeypatch):
        monkeypatch.setattr(
            schedule_endpoints,
            "draft_from_pdf",
            lambda content: ([DraftBlock("mon", "IOE", time(9, 5), time(10, 0))], []),
        )

        res = await auth_client.post("/api/schedule/draft-pdf", files=PDF_UPLOAD)

        assert res.status_code == 200, res.text
        assert res.json()["blocks"][0] == {
            "day_of_week": "mon",
            "label": "IOE",
            "start_time": "09:05:00",
            "end_time": "10:00:00",
        }

    async def test_a_file_that_is_not_a_pdf_never_reaches_the_reader(self, auth_client, monkeypatch):
        def explode(content):
            raise AssertionError("should not have been read")

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", explode)

        res = await auth_client.post(
            "/api/schedule/draft-pdf", files={"file": ("photo.jpg", b"\xff\xd8\xff", "image/jpeg")}
        )

        assert res.status_code == 422
        assert "isn't a PDF" in res.json()["detail"]

    async def test_an_unreadable_timetable_is_a_422_with_a_reason(self, auth_client, monkeypatch):
        def unreadable(content):
            raise TimetableUnreadable("I couldn't find a timetable grid in that PDF.")

        monkeypatch.setattr(schedule_endpoints, "draft_from_pdf", unreadable)

        res = await auth_client.post("/api/schedule/draft-pdf", files=PDF_UPLOAD)

        assert res.status_code == 422
        assert "couldn't find a timetable grid" in res.json()["detail"]

    async def test_an_oversized_file_is_refused(self, auth_client, monkeypatch):
        monkeypatch.setattr(schedule_endpoints, "MAX_PDF_BYTES", 10)

        res = await auth_client.post(
            "/api/schedule/draft-pdf",
            files={"file": ("big.pdf", b"%PDF" + b"x" * 20, "application/pdf")},
        )

        assert res.status_code == 413

    async def test_it_needs_a_logged_in_user(self, client):
        res = await client.post("/api/schedule/draft-pdf", files=PDF_UPLOAD)

        assert res.status_code == 401
