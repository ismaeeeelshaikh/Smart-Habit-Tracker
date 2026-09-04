import { useMemo, useState } from 'react';
import { ReminderForm } from '../components/reminders/ReminderForm';
import { ReminderList } from '../components/reminders/ReminderList';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useGoals } from '../hooks/useGoals';
import { useReminders } from '../hooks/useReminders';
import type { ReminderStatus } from '../types';

type RangeKey = 'week' | 'all';

const SELECT_CLASS =
    'h-10 px-3 rounded-[8px] border border-[var(--color-border)] bg-transparent ' +
    'text-[15px] font-inter focus:outline-none focus:ring-2 focus:ring-[var(--color-free)]';

/** Monday 00:00 to Sunday 23:59:59.999 of the week containing `now`. */
const currentWeek = (now = new Date()) => {
    const start = new Date(now);
    // getDay() is Sunday-based; the app's week starts on Monday.
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start: start.toISOString(), end: end.toISOString() };
};

export const Reminders = () => {
    const [status, setStatus] = useState<ReminderStatus | 'all'>('all');
    const [range, setRange] = useState<RangeKey>('week');
    const [isAdding, setIsAdding] = useState(false);

    const filters = useMemo(() => {
        const window = range === 'week' ? currentWeek() : {};
        return { status: status === 'all' ? undefined : status, ...window };
    }, [status, range]);

    const { reminders, hasAny, isLoading, error, refetch, addReminder } = useReminders(filters);
    const { goals } = useGoals();

    const activeGoals = useMemo(() => goals.filter((goal) => goal.is_active), [goals]);

    const handleCreate = async (data: Parameters<typeof addReminder>[0]) => {
        await addReminder(data);
        setIsAdding(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
            <header className="flex flex-wrap gap-4 justify-between items-start">
                <div>
                    <h1 className="font-display font-semibold text-[24px]">Reminders</h1>
                    <p className="text-[var(--color-ink-muted)]">
                        View your reminder history and status.
                    </p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)}>Add manual reminder</Button>
                )}
            </header>

            {isAdding && (
                <ReminderForm
                    goals={activeGoals}
                    onSubmit={handleCreate}
                    onCancel={() => setIsAdding(false)}
                />
            )}

            <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" htmlFor="filter-status">
                        Status
                    </label>
                    <select
                        id="filter-status"
                        className={SELECT_CLASS}
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ReminderStatus | 'all')}
                    >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="done">Done</option>
                        <option value="later">Later</option>
                        <option value="skipped">Skipped</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" htmlFor="filter-range">
                        Range
                    </label>
                    <select
                        id="filter-range"
                        className={SELECT_CLASS}
                        value={range}
                        onChange={(e) => setRange(e.target.value as RangeKey)}
                    >
                        <option value="week">This week</option>
                        <option value="all">All time</option>
                    </select>
                </div>
            </div>

            {error ? (
                <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
                    <p>Couldn't load reminders.</p>
                    <button
                        onClick={refetch}
                        className="font-medium text-[var(--color-free)] hover:brightness-90 transition-all"
                    >
                        Retry
                    </button>
                </div>
            ) : isLoading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-free)]" />
                </div>
            ) : reminders.length === 0 ? (
                // A user with no reminders at all needs different words from one
                // whose filter simply matched nothing.
                <EmptyState
                    message={
                        hasAny
                            ? 'No reminders match this filter.'
                            : "You don't have any reminders yet."
                    }
                    actionLabel={isAdding ? undefined : 'Add manual reminder'}
                    onAction={isAdding ? undefined : () => setIsAdding(true)}
                />
            ) : (
                <ReminderList reminders={reminders} />
            )}
        </div>
    );
};
