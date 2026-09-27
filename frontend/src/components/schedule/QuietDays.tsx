import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Moon } from 'lucide-react';
import { addDaysOff, deleteDayOff, getDaysOff } from '../../api';
import type { DayOff, DayOfWeek } from '../../types';
import { Button } from '../ui/Button';
import { InlineConfirm } from '../ui/InlineConfirm';

/** Local date as YYYY-MM-DD, which is what <input type="date"> speaks. */
const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
// Noon, so no timezone offset can push the date onto a neighbouring day.
const formatDay = (iso: string) => dayFormat.format(new Date(`${iso}T12:00:00`));

const nextDay = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return localIso(d);
};

/** Back-to-back dates with one name are one holiday: "Diwali · 20 Oct – 23 Oct". */
interface Stretch {
    label: string;
    first: string;
    last: string;
    ids: string[];
}

const toStretches = (days: DayOff[]): Stretch[] => {
    const stretches: Stretch[] = [];
    for (const day of days) {
        const current = stretches[stretches.length - 1];
        if (current && current.label === day.label && nextDay(current.last) === day.date) {
            current.last = day.date;
            current.ids.push(day.id);
        } else {
            stretches.push({ label: day.label, first: day.date, last: day.date, ids: [day.id] });
        }
    }
    return stretches;
};

const WEEK: { id: DayOfWeek; short: string; long: string }[] = [
    { id: 'mon', short: 'Mon', long: 'Monday' },
    { id: 'tue', short: 'Tue', long: 'Tuesday' },
    { id: 'wed', short: 'Wed', long: 'Wednesday' },
    { id: 'thu', short: 'Thu', long: 'Thursday' },
    { id: 'fri', short: 'Fri', long: 'Friday' },
    { id: 'sat', short: 'Sat', long: 'Saturday' },
    { id: 'sun', short: 'Sun', long: 'Sunday' },
];

interface QuietDaysProps {
    /** Weekdays already quiet, from the user's settings. */
    quietDays: DayOfWeek[];
    /** Saves the whole new set. */
    onChangeQuietDays: (days: DayOfWeek[]) => Promise<unknown>;
}

const inputClass =
    'h-11 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]';

/**
 * One idea, two ways to say it: every week ("every Saturday") or on a date
 * ("Diwali, 20–23 Oct"). Either way that day gets no lecture warnings and no
 * suggestions, while reminders the user set themselves still arrive.
 */
export const QuietDays: React.FC<QuietDaysProps> = ({ quietDays, onChangeQuietDays }) => {
    const [days, setDays] = useState<DayOff[]>([]);
    const [label, setLabel] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDay, setPendingDay] = useState<DayOfWeek | null>(null);
    const today = localIso(new Date());

    const toggleWeekday = async (day: DayOfWeek) => {
        setError(null);
        setPendingDay(day);
        const next = quietDays.includes(day) ? quietDays.filter((d) => d !== day) : [...quietDays, day];
        try {
            await onChangeQuietDays(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save that. Please try again.");
        } finally {
            setPendingDay(null);
        }
    };

    const load = useCallback(async () => {
        try {
            setDays(await getDaysOff());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load your days off.");
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!label.trim() || !from) {
            setError('Give the day a name and a date.');
            return;
        }
        if (to && to < from) {
            setError("The last day can't be before the first.");
            return;
        }
        setIsSaving(true);
        try {
            await addDaysOff({ label: label.trim(), start_date: from, end_date: to || null });
            setLabel('');
            setFrom('');
            setTo('');
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't add that day off.");
        } finally {
            setIsSaving(false);
        }
    };

    const remove = async (stretch: Stretch) => {
        setError(null);
        try {
            await Promise.all(stretch.ids.map((id) => deleteDayOff(id)));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't remove that day off.");
        }
        await load();
    };

    const stretches = toStretches(days);

    return (
        <section className="border border-[var(--color-border)] rounded-[16px] bg-[var(--color-surface)] p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-free-tint)] text-[var(--color-free)]">
                    <Moon className="h-4 w-4" />
                </span>
                <div>
                    <h2 className="font-display font-semibold text-[17px] leading-tight text-[var(--color-ink)]">Quiet days</h2>
                    <p className="text-[13px] text-[var(--color-ink-muted)] mt-1 leading-snug">
                        No lecture warnings and no suggestions on these days. Reminders you set yourself still
                        arrive.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <p className="text-sm font-medium" id="quiet-weekdays">
                    Every week
                </p>
                <div role="group" aria-labelledby="quiet-weekdays" className="grid grid-cols-7 gap-1.5">
                    {WEEK.map((day) => {
                        const quiet = quietDays.includes(day.id);
                        return (
                            <button
                                key={day.id}
                                type="button"
                                aria-pressed={quiet}
                                aria-label={`${day.long}: ${quiet ? 'quiet' : 'notifications on'}`}
                                disabled={pendingDay !== null}
                                onClick={() => toggleWeekday(day.id)}
                                className={`h-11 rounded-[12px] border px-1 font-display text-[12px] font-semibold transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)] disabled:opacity-60 ${
                                    quiet
                                        ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-bg)]'
                                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-free)]'
                                }`}
                            >
                                {day.short}
                            </button>
                        );
                    })}
                </div>
            </div>

            <p className="text-sm font-medium border-t border-[var(--color-border)] pt-3">On dates</p>

            {stretches.length > 0 ? (
                <ul className="flex flex-col gap-2">
                    {stretches.map((stretch) => (
                        <li
                            key={stretch.ids[0]}
                            className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-[12px] bg-[var(--color-surface-soft)]"
                        >
                            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" />
                            <span className="flex-1 text-sm min-w-0 break-words">
                                <span className="font-medium">{stretch.label}</span>
                                <span className="block font-mono text-[12px] text-[var(--color-ink-muted)]">
                                    {formatDay(stretch.first)}
                                    {stretch.last !== stretch.first && ` – ${formatDay(stretch.last)}`}
                                </span>
                            </span>
                            <InlineConfirm
                                promptMessage="Remove this day off?"
                                confirmLabel="Yes, remove"
                                onConfirm={() => remove(stretch)}
                            >
                                <Button
                                    variant="secondary"
                                    className="text-sm px-3 py-1.5 h-auto"
                                    aria-label={`Remove ${stretch.label}`}
                                >
                                    Remove
                                </Button>
                            </InlineConfirm>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-muted-foreground">No dates coming up.</p>
            )}

            <form onSubmit={add} className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium flex-1 min-w-[10rem]">
                    Name
                    <input
                        className={inputClass}
                        name="day-off-label"
                        autoComplete="off"
                        value={label}
                        maxLength={100}
                        placeholder="Diwali…"
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                    From
                    <input
                        type="date"
                        className={inputClass}
                        name="day-off-from"
                        min={today}
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                    To (optional)
                    <input
                        type="date"
                        className={inputClass}
                        name="day-off-to"
                        min={from || today}
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                </label>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Adding…' : 'Add day off'}
                </Button>
            </form>

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </section>
    );
};
