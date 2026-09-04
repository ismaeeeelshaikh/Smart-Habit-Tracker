import { useCallback, useEffect, useState } from 'react';
import {
    createScheduleBlock,
    deleteScheduleBlock,
    getScheduleBlocks,
    updateScheduleBlock,
} from '../api';
import type { ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate } from '../types';

/** Schedule CRUD shared by the /schedule screen and onboarding step 1. */
export const useScheduleBlocks = () => {
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        try {
            setBlocks(await getScheduleBlocks());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load schedule.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const addBlock = useCallback(async (data: ScheduleBlockCreate) => {
        const created = await createScheduleBlock(data);
        setBlocks((prev) => [...prev, created]);
        return created;
    }, []);

    const editBlock = useCallback(async (id: string, data: ScheduleBlockUpdate) => {
        const updated = await updateScheduleBlock(id, data);
        setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
        return updated;
    }, []);

    const removeBlock = useCallback(async (id: string) => {
        await deleteScheduleBlock(id);
        setBlocks((prev) => prev.filter((b) => b.id !== id));
    }, []);

    return { blocks, isLoading, error, refetch, addBlock, editBlock, removeBlock };
};
