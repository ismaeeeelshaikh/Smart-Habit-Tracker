import { GoalList } from '../components/goals/GoalList';
import { SuggestGoals } from '../components/goals/SuggestGoals';
import { useGoals } from '../hooks/useGoals';

export const Goals = () => {
  const { goals, isLoading, error, addGoal, editGoal, removeGoal } = useGoals();

  const hasActiveGoals = goals.some((g) => g.is_active);
  const showNoActiveWarning = !isLoading && !error && goals.length > 0 && !hasActiveGoals;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 max-w-[720px] mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[26px] leading-[32px] sm:text-[28px] text-[var(--color-ink)]">
          Goals
        </h1>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">What you're making time for</p>
      </header>

      {showNoActiveWarning && (
        <div className="px-4 py-3 rounded-[12px] bg-[var(--color-warning-bg)] text-[var(--color-ink)] text-[15px] leading-[22px]">
          You have no active goals — you won't receive any suggestions. Add or activate a goal to
          resume tracking.
        </div>
      )}

      {error && <p className="text-[var(--color-error)] font-medium">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-free)]" />
        </div>
      ) : (
        <GoalList
          goals={goals}
          onAddGoal={addGoal}
          onEditGoal={editGoal}
          onDeleteGoal={removeGoal}
        />
      )}

      {/* Below your own goals: most visits are to tick a step, not to find new habits. */}
      <SuggestGoals onAdd={addGoal} />
    </div>
  );
};
