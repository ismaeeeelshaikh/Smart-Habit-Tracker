import { useCallback, useEffect, useState } from 'react';
import { createReminder, getReminders } from '../api';
import type { Reminder, ReminderCreate, ReminderFilters } from '../types';

/**
 * Reminder history for the /reminders screen.
 *
 * Filtering is done server-side (UX Flow Document Section 8: the filters
 * re-fetch `GET /reminders` with query params) rather than in the browser, so
 * the list stays correct once a user has more history than one page's worth.
 *
 * `hasAny` comes from a single unfiltered probe on mount. It exists only to
 * tell the two empty states apart — "no reminders yet" is a different message
 * from "none match this filter", and a filtered response alone can't
 * distinguish them.
 */
export const useReminders = (filters: ReminderFilters) => {
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [hasAny, setHasAny] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { status, start, end } = filters;

    const refetch = useCallback(async () => {
        setIsLoading(true);
        try {
            const found = await getReminders({ status, start, end });
            setReminders(found);
            if (found.length > 0) setHasAny(true);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load reminders.");
        } finally {
            setIsLoading(false);
        }
    }, [status, start, end]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    useEffect(() => {
        let cancelled = false;
        getReminders()
            .then((all) => {
                if (!cancelled && all.length > 0) setHasAny(true);
            })
            .catch(() => {
                // The filtered request above owns the error surface; a failed
                // probe only means we fall back to the filtered empty state.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const addReminder = useCallback(
        async (data: ReminderCreate) => {
            const created = await createReminder(data);
            setHasAny(true);
            // Re-fetch rather than splicing it in: the new reminder may fall
            // outside the active filter, and the list is time-ordered.
            await refetch();
            return created;
        },
        [refetch],
    );

    return { reminders, hasAny, isLoading, error, refetch, addReminder };
};
