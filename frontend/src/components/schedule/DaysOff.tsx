import React, { useCallback, useEffect, useState } from 'react';
import { addDaysOff, deleteDayOff, getDaysOff } from '../../api';
import type { DayOff } from '../../types';
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

const inputClass =
    'h-10 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]';

export const DaysOff: React.FC = () => {
    const [days, setDays] = useState<DayOff[]>([]);
    const [label, setLabel] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const today = localIso(new Date());

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
        <section className="border border-border rounded-lg bg-card p-4 flex flex-col gap-3">
            <div>
                <h2 className="font-semibold text-lg">Days off</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                    A festival, a trip, a sick day. No lecture warnings and no suggestions that day — reminders
                    you set yourself still arrive.
                </p>
            </div>

            {stretches.length > 0 ? (
                <ul className="flex flex-col gap-2">
                    {stretches.map((stretch) => (
                        <li
                            key={stretch.ids[0]}
                            className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md border border-border bg-background"
                        >
                            <span className="text-sm min-w-0 break-words">
                                <span className="font-medium">{stretch.label}</span>
                                <span className="text-muted-foreground">
                                    {' · '}
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
                <p className="text-sm text-muted-foreground">No days off coming up.</p>
            )}

            <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
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
