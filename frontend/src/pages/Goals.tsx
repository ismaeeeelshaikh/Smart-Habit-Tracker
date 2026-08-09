import { useEffect, useState } from 'react';
import { GoalList } from '../components/goals/GoalList';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api';
import type { Goal, GoalCreate, GoalUpdate } from '../types';

export const Goals = () => {
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

  const hasActiveGoals = goals.some(g => g.is_active);
  const isFullyLoaded = !isLoading && !error;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Goals</h1>
        <p className="text-[var(--color-ink-muted)]">Manage your habit goals.</p>
      </header>

      {isFullyLoaded && goals.length > 0 && !hasActiveGoals && (
        <div className="p-4 rounded-lg bg-[var(--color-priority-medium)]/10 text-[var(--color-priority-medium)] border border-[var(--color-priority-medium)]/20 text-sm font-medium">
          You have no active goals — you won't receive any suggestions. Add or activate a goal to resume tracking.
        </div>
      )}

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
    </div>
  );
};
