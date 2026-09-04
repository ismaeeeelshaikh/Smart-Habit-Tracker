import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Goal, RecurrenceRule, ReminderCreate } from '../../types';

interface ReminderFormProps {
    /** Active goals only — a reminder for a paused goal isn't offered. */
    goals: Goal[];
    onSubmit: (data: ReminderCreate) => Promise<unknown>;
    onCancel: () => void;
}

const SELECT_CLASS =
    'w-full h-10 px-3 rounded-[8px] border border-[var(--color-border)] bg-transparent ' +
    'text-[15px] font-inter focus:outline-none focus:ring-2 focus:ring-[var(--color-free)]';

/** A one-off gets its own text; anything else borrows the goal's name. */
const ONE_OFF = 'one-off';

export const ReminderForm: React.FC<ReminderFormProps> = ({ goals, onSubmit, onCancel }) => {
    const [target, setTarget] = useState<string>(ONE_OFF);
    const [label, setLabel] = useState('');
    const [when, setWhen] = useState('');
    const [recurrence, setRecurrence] = useState<RecurrenceRule>('none');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isOneOff = target === ONE_OFF;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (isOneOff && !label.trim()) {
            setError('Give the reminder a name.');
            return;
        }
        if (!when) {
            setError('Pick a date and time.');
            return;
        }
        // The server enforces this too; checking here saves a round trip and
        // puts the message next to the field that caused it.
        if (recurrence === 'none' && new Date(when).getTime() <= Date.now()) {
            setError('Pick a time in the future.');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit({
                goal_id: isOneOff ? null : target,
                label: isOneOff ? label.trim() : null,
                // A datetime-local value is the user's own wall clock, which is
                // exactly how the server reads a naive time.
                scheduled_time: when,
                recurrence_rule: recurrence,
            });
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Couldn't create reminder. Please try again.",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 p-4 rounded-[10px] border border-[var(--color-border)]"
        >
            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium" htmlFor="reminder-target">
                    What for
                </label>
                <select
                    id="reminder-target"
                    className={SELECT_CLASS}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                >
                    <option value={ONE_OFF}>One-off task…</option>
                    {goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                            {goal.name}
                        </option>
                    ))}
                </select>
            </div>

            {isOneOff && (
                <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" htmlFor="reminder-label">
                        Task name
                    </label>
                    <Input
                        id="reminder-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="e.g. Call the dentist"
                        maxLength={150}
                    />
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium" htmlFor="reminder-when">
                    When
                </label>
                <Input
                    id="reminder-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium" htmlFor="reminder-recurrence">
                    Repeat
                </label>
                <select
                    id="reminder-recurrence"
                    className={SELECT_CLASS}
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as RecurrenceRule)}
                >
                    <option value="none">Don't repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                </select>
            </div>

            {error && <p className="text-[13px] text-[var(--color-error)] font-medium">{error}</p>}

            <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </form>
    );
};
