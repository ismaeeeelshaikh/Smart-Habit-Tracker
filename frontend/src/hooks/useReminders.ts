import { useCallback, useEffect, useState } from 'react';
import { createReminder, deleteReminder, getReminders } from '../api';
import type { Reminder, ReminderCreate } from '../types';

/**
 * The user's own reminders for the /reminders screen.
 *
 * The API also holds the reminders the dispatcher creates for goal
 * suggestions; those belong to the Dashboard and Telegram, so they are left
 * out here. A one-off whose time has passed is left out too: this screen is
 * "what's coming up", not a history.
 */
const isUpcomingOwn = (r: Reminder, now: number) =>
    r.goal_id === null && (r.is_recurring || new Date(r.scheduled_time).getTime() > now);

export const useReminders = () => {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        setIsLoading(true);
        try {
            const all = await getReminders();
            const now = Date.now();
            setReminders(all.filter((r) => isUpcomingOwn(r, now)));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load reminders.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const addReminder = useCallback(
        async (data: ReminderCreate) => {
            const created = await createReminder(data);
            // Re-fetch rather than splicing it in: the list is time-ordered.
            await refetch();
            return created;
        },
        [refetch],
    );

    const removeReminder = useCallback(async (id: string) => {
        await deleteReminder(id);
        setReminders((prev) => prev.filter((r) => r.id !== id));
    }, []);

    return { reminders, isLoading, error, refetch, addReminder, removeReminder };
};
