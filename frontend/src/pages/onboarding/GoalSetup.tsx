import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { GoalList } from '../../components/goals/GoalList';
import { useGoals } from '../../hooks/useGoals';

export const GoalSetup = () => {
  const navigate = useNavigate();
  const { goals, isLoading, error, addGoal, editGoal, removeGoal } = useGoals();

  const hasGoals = goals.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-8 animate-in fade-in duration-300 mb-12">
      <div className="text-[13px] font-inter text-[var(--color-ink-muted)] font-medium">
        Step 2 of 3: Your Goals
      </div>

      <header>
        <h1 className="font-display font-semibold text-[24px]">What do you want to achieve?</h1>
        <p className="text-[var(--color-ink-muted)] mt-2">
          Add habits or goals you want to make time for.
        </p>
      </header>

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

      <div className="flex justify-between items-center pt-8 border-t border-[var(--color-border)]">
        <button
          className="text-[15px] font-inter text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          onClick={() => navigate('/onboarding/schedule')}
        >
          Back
        </button>
        <div className="flex items-center space-x-3">
          {!hasGoals && (
            <span className="text-[13px] text-[var(--color-ink-muted)]">
              Add at least one goal to continue
            </span>
          )}
          <Button disabled={!hasGoals} onClick={() => navigate('/onboarding/telegram-link')}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};
