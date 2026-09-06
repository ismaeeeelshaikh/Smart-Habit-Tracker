import { useCallback, useEffect, useState } from 'react';
import { createGoal, deleteGoal, getGoals, updateGoal } from '../api';
import type { Goal, GoalCreate, GoalUpdate } from '../types';

/** Goal CRUD shared by the /goals screen and onboarding step 2. */
export const useGoals = () => {
    const [goals, setGoals] = useState<Goal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        try {
            setGoals(await getGoals());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load your goals. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const addGoal = useCallback(async (data: GoalCreate) => {
        const created = await createGoal(data);
        setGoals((prev) => [...prev, created]);
        return created;
    }, []);

    const editGoal = useCallback(async (id: string, data: GoalUpdate) => {
        const updated = await updateGoal(id, data);
        setGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
        return updated;
    }, []);

    const removeGoal = useCallback(async (id: string) => {
        await deleteGoal(id);
        setGoals((prev) => prev.filter((g) => g.id !== id));
    }, []);

    return { goals, isLoading, error, refetch, addGoal, editGoal, removeGoal };
};
