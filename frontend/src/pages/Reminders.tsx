import { useState } from 'react';
import { BellRing, Plus } from 'lucide-react';
import { ReminderForm } from '../components/reminders/ReminderForm';
import { ReminderList } from '../components/reminders/ReminderList';
import { useReminders } from '../hooks/useReminders';

/**
 * Your own reminders — something that came up and isn't in the schedule.
 * Goal suggestions and their Done / Later / Skip live on the Dashboard and in
 * Telegram, not here (decided 27 Sep 2026).
 */
export const Reminders = () => {
    const [isAdding, setIsAdding] = useState(false);
    const { reminders, isLoading, error, refetch, addReminder, removeReminder } = useReminders();
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        setDeleteError(null);
        try {
            await removeReminder(id);
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : "Couldn't delete that reminder. Please try again.");
        }
    };

    const handleCreate = async (data: Parameters<typeof addReminder>[0]) => {
        await addReminder(data);
        setIsAdding(false);
    };

    return (
        <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 max-w-[720px] mx-auto mb-12">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="font-display font-semibold text-[26px] leading-[32px] sm:text-[28px] text-[var(--color-ink)]">
                        Reminders
                    </h1>
                    <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
                        For things that aren't in your schedule.
                    </p>
                </div>
                {!isAdding && (
                    <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[var(--color-free)] px-4 font-inter text-[14px] font-semibold text-[var(--color-on-free)] transition-[filter] touch-manipulation hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] focus-visible:ring-offset-2"
                    >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        Add reminder
                    </button>
                )}
            </header>

            {isAdding && <ReminderForm onSubmit={handleCreate} onCancel={() => setIsAdding(false)} />}

            {deleteError && (
                <p role="alert" className="text-[13px] font-medium text-[var(--color-error)]">
                    {deleteError}
                </p>
            )}

            {error ? (
                <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
                    <p>Couldn't load reminders.</p>
                    <button
                        onClick={refetch}
                        className="min-h-[44px] font-medium text-[var(--color-free)] hover:brightness-90 transition-all"
                    >
                        Retry
                    </button>
                </div>
            ) : isLoading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-free)]" />
                </div>
            ) : reminders.length === 0 ? (
                <div className="grid justify-items-center gap-3 rounded-[16px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[12px] bg-[var(--color-free-tint)] text-[var(--color-free)]">
                        <BellRing className="h-5 w-5" />
                    </span>
                    <p className="font-inter text-[15px] text-[var(--color-ink-muted)]">
                        No reminders coming up.
                    </p>
                    {!isAdding && (
                        <button
                            type="button"
                            onClick={() => setIsAdding(true)}
                            className="min-h-[44px] rounded-[10px] px-3 font-inter text-[15px] font-medium text-[var(--color-free)] hover:bg-[var(--color-free-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                        >
                            Add a reminder
                        </button>
                    )}
                </div>
            ) : (
                <ReminderList reminders={reminders} onDelete={handleDelete} />
            )}
        </div>
    );
};
