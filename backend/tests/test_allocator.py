"""Fixture-based, fully deterministic tests for priority allocation."""

from app.services.allocator import GoalSpec, allocate, best_fit, rank_goals


def goal(gid, name, priority, minutes):
    return GoalSpec(id=gid, name=name, priority=priority, duration_minutes=minutes)


REACT = goal("g1", "Learn React", "high", 20)
MEDITATION = goal("g2", "Meditation", "low", 10)
EXERCISE = goal("g3", "Exercise", "medium", 45)
READ = goal("g4", "Read a book", "high", 30)


class TestRanking:
    def test_orders_by_priority_then_longest_first(self):
        ranked = rank_goals([MEDITATION, EXERCISE, REACT, READ])
        assert [g.name for g in ranked] == [
            "Read a book",   # high, 30
            "Learn React",   # high, 20
            "Exercise",      # medium
            "Meditation",    # low
        ]

    def test_ties_break_on_name_then_id_so_input_order_never_matters(self):
        a = goal("z", "Alpha", "high", 15)
        b = goal("a", "Beta", "high", 15)
        assert [g.name for g in rank_goals([b, a])] == ["Alpha", "Beta"]
        assert [g.name for g in rank_goals([a, b])] == ["Alpha", "Beta"]

    def test_unknown_priority_sorts_last_instead_of_raising(self):
        odd = goal("g9", "Mystery", "urgent", 10)
        assert rank_goals([odd, MEDITATION])[-1].name == "Mystery"


class TestAllocate:
    def test_reproduces_the_prd_worked_example(self):
        # PRD 4.4: "30-min slot -> 20-min React + 10-min Meditation"
        plan = allocate(30, [REACT, MEDITATION])

        assert [(a.goal_name, a.minutes, a.offset_minutes) for a in plan] == [
            ("Learn React", 20, 0),
            ("Meditation", 10, 20),
        ]

    def test_fills_by_priority_first(self):
        # 60 min: React (high, 20) goes first, leaving 40. Exercise (medium, 45)
        # no longer fits, so the slot is topped up with Meditation (low, 10)
        # rather than left empty.
        plan = allocate(60, [MEDITATION, EXERCISE, REACT])
        assert [a.goal_name for a in plan] == ["Learn React", "Meditation"]

    def test_takes_the_highest_priority_goal_that_fits_the_whole_slot(self):
        plan = allocate(45, [MEDITATION, EXERCISE])
        assert [a.goal_name for a in plan] == ["Exercise"]

    def test_skips_a_goal_that_does_not_fit_and_tries_the_next(self):
        # Exercise (45) will not fit in 25 minutes, but React (20) does.
        plan = allocate(25, [EXERCISE, REACT])
        assert [a.goal_name for a in plan] == ["Learn React"]

    def test_more_pending_minutes_than_slot_time_partially_fills(self):
        goals = [READ, REACT, EXERCISE, MEDITATION]  # 105 minutes of intent
        plan = allocate(30, goals)

        assert sum(a.minutes for a in plan) <= 30
        assert [a.goal_name for a in plan] == ["Read a book"]

    def test_offsets_are_cumulative_and_stay_inside_the_slot(self):
        plan = allocate(60, [READ, REACT, MEDITATION])
        assert [(a.minutes, a.offset_minutes) for a in plan] == [(30, 0), (20, 30), (10, 50)]
        assert plan[-1].offset_minutes + plan[-1].minutes <= 60

    def test_returns_empty_when_nothing_fits(self):
        assert allocate(5, [REACT, EXERCISE]) == []

    def test_returns_empty_for_no_goals(self):
        assert allocate(60, []) == []

    def test_returns_empty_for_a_zero_or_negative_slot(self):
        assert allocate(0, [MEDITATION]) == []
        assert allocate(-30, [MEDITATION]) == []

    def test_a_goal_exactly_filling_the_slot_is_taken(self):
        plan = allocate(20, [REACT])
        assert [a.goal_name for a in plan] == ["Learn React"]

    def test_each_goal_is_used_at_most_once_per_slot(self):
        plan = allocate(120, [REACT])
        assert len(plan) == 1

    def test_excluded_goals_are_skipped(self):
        plan = allocate(30, [REACT, MEDITATION], exclude_goal_ids={"g1"})
        assert [a.goal_name for a in plan] == ["Meditation"]

    def test_non_positive_durations_are_ignored(self):
        broken = goal("g8", "Broken", "high", 0)
        plan = allocate(30, [broken, MEDITATION])
        assert [a.goal_name for a in plan] == ["Meditation"]

    def test_carries_priority_through_for_rendering(self):
        plan = allocate(30, [REACT, MEDITATION])
        assert [a.priority for a in plan] == ["high", "low"]

    def test_is_deterministic_regardless_of_input_order(self):
        goals = [READ, REACT, EXERCISE, MEDITATION]
        assert allocate(60, goals) == allocate(60, list(reversed(goals)))


class TestBestFit:
    def test_returns_the_single_highest_priority_goal_that_fits(self):
        assert best_fit(60, [MEDITATION, EXERCISE, REACT]).goal_name == "Learn React"

    def test_returns_none_when_nothing_fits(self):
        assert best_fit(5, [REACT]) is None

    def test_honours_exclusions(self):
        assert best_fit(30, [REACT, MEDITATION], exclude_goal_ids={"g1"}).goal_name == "Meditation"
