import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { GoalList } from '../../components/goals/GoalList';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../../api';
import type { Goal, GoalCreate, GoalUpdate } from '../../types';

export const GoalSetup = () => {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = async () => {
    try {
      const data = await getGoals();
      setGoals(data);
    } catch (err: any) {
      setError('Failed to load goals. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleAdd = async (data: GoalCreate) => {
    const newGoal = await createGoal(data);
    setGoals(prev => [...prev, newGoal]);
  };

  const handleEdit = async (id: string, data: GoalUpdate) => {
    const updatedGoal = await updateGoal(id, data);
    setGoals(prev => prev.map(g => (g.id === id ? updatedGoal : g)));
  };

  const handleDelete = async (id: string) => {
    await deleteGoal(id);
    setGoals(prev => prev.filter(g => g.id !== id));
  };

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

      {error && <p className="text-destructive font-medium">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center p-8">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <GoalList 
          goals={goals} 
          onAddGoal={handleAdd} 
          onEditGoal={handleEdit} 
          onDeleteGoal={handleDelete} 
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
