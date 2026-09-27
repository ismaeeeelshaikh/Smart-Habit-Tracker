import React, { useId, useState } from 'react';
import { BellPlus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TimePicker } from '../ui/TimePicker';
import type { RecurrenceRule, ReminderCreate } from '../../types';
import { cn } from '../../utils/cn';

interface ReminderFormProps {
    onSubmit: (data: ReminderCreate) => Promise<unknown>;
    onCancel: () => void;
}

/** Local date as YYYY-MM-DD, what <input type="date"> speaks. */
const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The next full hour, so the form opens on a sensible, future time. */
const nextHour = (now = new Date()) => {
    const d = new Date(now);
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return { date: localIso(d), time: `${String(d.getHours()).padStart(2, '0')}:00` };
};

const REPEATS: { value: RecurrenceRule; label: string }[] = [
    { value: 'none', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekdays', label: 'Weekdays' },
];

const chip = (selected: boolean) =>
    cn(
        'min-h-[40px] rounded-full border px-3.5 font-inter text-[13px] font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] focus-visible:ring-offset-2',
        selected
            ? 'border-[var(--color-free)] bg-[var(--color-free-tint)] text-[var(--color-free)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]',
    );

/**
 * A reminder for something that came up — "Call the dentist at 4", "Pay the
 * fee on Friday". Goals aren't offered here: they are already suggested in
 * your free time, and a fixed-time reminder for one would ignore the schedule.
 */
export const ReminderForm: React.FC<ReminderFormProps> = ({ onSubmit, onCancel }) => {
    const [label, setLabel] = useState('');
    // Split in two so the time can use the app's own 12-hour picker: a native
    // datetime-local input shows 24-hour time on many phones.
    const [date, setDate] = useState(() => nextHour().date);
    const [time, setTime] = useState(() => nextHour().time);
    const when = date ? `${date}T${time}` : '';
    const [recurrence, setRecurrence] = useState<RecurrenceRule>('none');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const titleId = useId();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!label.trim()) {
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
                goal_id: null,
                label: label.trim(),
                // A naive "YYYY-MM-DDTHH:MM" is the user's own wall clock, which
                // is exactly how the server reads a naive time.
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
        // noValidate: the date's `min` greys out past days in the picker, but the
        // message for a past time should be ours, next to the fields.
        <form
            onSubmit={handleSubmit}
            noValidate
            aria-labelledby={titleId}
            className="flex flex-col gap-4 rounded-[16px] border border-[var(--color-free)]/40 bg-[var(--color-surface)] p-4 sm:p-5"
        >
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-free-tint)] text-[var(--color-free)]">
                    <BellPlus className="h-4 w-4" />
                </span>
                <div>
                    <h2 id={titleId} className="font-display text-[17px] font-semibold leading-tight text-[var(--color-ink)]">
                        New reminder
                    </h2>
                    <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-muted)]">
                        For something that isn't in your schedule. Telegram reminds you at that time.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[var(--color-ink)]" htmlFor="reminder-label">
                    Remind me to
                </label>
                <Input
                    id="reminder-label"
                    name="reminder-label"
                    autoComplete="off"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Call the dentist…"
                    maxLength={150}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-[var(--color-ink)]" htmlFor="reminder-date">
                        Date
                    </label>
                    <Input
                        id="reminder-date"
                        type="date"
                        min={localIso(new Date())}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="font-mono"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-[var(--color-ink)]" htmlFor="reminder-time">
                        Time
                    </label>
                    <TimePicker id="reminder-time" value={time} onChange={setTime} />
                </div>
            </div>

            <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[13px] font-medium text-[var(--color-ink)]">Repeat</legend>
                <div className="flex flex-wrap gap-2">
                    {REPEATS.map((r) => (
                        <label
                            key={r.value}
                            className={cn(
                                chip(recurrence === r.value),
                                'inline-flex cursor-pointer items-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-free)] has-[:focus-visible]:ring-offset-2',
                            )}
                        >
                            <input
                                type="radio"
                                name="reminder-repeat"
                                value={r.value}
                                checked={recurrence === r.value}
                                onChange={() => setRecurrence(r.value)}
                                className="sr-only"
                            />
                            {r.label}
                        </label>
                    ))}
                </div>
            </fieldset>

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
