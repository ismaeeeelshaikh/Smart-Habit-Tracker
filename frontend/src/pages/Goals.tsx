import { GoalList } from '../components/goals/GoalList';
import { useGoals } from '../hooks/useGoals';

export const Goals = () => {
  const { goals, isLoading, error, addGoal, editGoal, removeGoal } = useGoals();

  const hasActiveGoals = goals.some((g) => g.is_active);
  const showNoActiveWarning = !isLoading && !error && goals.length > 0 && !hasActiveGoals;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Goals</h1>
        <p className="text-[var(--color-ink-muted)]">Manage your habit goals.</p>
      </header>

      {showNoActiveWarning && (
        <div className="p-4 rounded-lg bg-[var(--color-priority-medium)]/10 text-[var(--color-priority-medium)] border border-[var(--color-priority-medium)]/20 text-sm font-medium">
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
    </div>
  );
};
