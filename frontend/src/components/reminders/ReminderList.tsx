import React from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { InlineConfirm } from '../ui/InlineConfirm';
import type { Reminder } from '../../types';

/** "7:00 PM", built by hand so the clock reads the same as everywhere else. */
const clock = (when: Date) => {
    const hours = when.getHours();
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:${String(when.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Today", "Tomorrow", otherwise "Tue 3 Sep". */
const dayHeading = (d: Date, now = new Date()) => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dayKey(d) === dayKey(now)) return 'Today';
    if (dayKey(d) === dayKey(tomorrow)) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const RECURRENCE_LABEL: Record<string, string> = {
    daily: 'Repeats daily',
    weekdays: 'Repeats on weekdays',
};

interface RowProps {
    reminder: Reminder;
    repeating?: boolean;
    onDelete: (id: string) => Promise<unknown>;
}

const Row = ({ reminder, repeating, onDelete }: RowProps) => (
    <li className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 pl-4 pr-2 py-2">
        <span className="font-mono text-[13px] font-medium text-[var(--color-ink)]">
            {clock(new Date(reminder.scheduled_time))}
        </span>
        <div className="min-w-0">
            <p className="font-inter text-[15px] text-[var(--color-ink)] break-words">{reminder.label}</p>
            {repeating && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-[var(--color-ink-muted)]">
                    <Repeat aria-hidden="true" className="h-3 w-3" />
                    {RECURRENCE_LABEL[reminder.recurrence_rule]}
                </p>
            )}
        </div>
        <InlineConfirm
            promptMessage={repeating ? 'Stop this reminder?' : 'Delete this reminder?'}
            confirmLabel="Yes, delete"
            onConfirm={() => onDelete(reminder.id)}
        >
            {/* InlineConfirm is the button; this is only its face. */}
            <span
                title="Delete"
                className="grid h-10 w-10 place-items-center rounded-[10px] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-error)]"
            >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
            </span>
        </InlineConfirm>
    </li>
);

const Group = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
    <section aria-label={heading} className="grid gap-2">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            {heading}
        </h2>
        <ul className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] divide-y divide-[var(--color-border)]">
            {children}
        </ul>
    </section>
);

/** Coming up, day by day; repeating reminders in their own list after. */
export const ReminderList: React.FC<{
    reminders: Reminder[];
    onDelete: (id: string) => Promise<unknown>;
}> = ({ reminders, onDelete }) => {
    const once = reminders.filter((r) => !r.is_recurring);
    const repeating = reminders.filter((r) => r.is_recurring);

    // The API sends them in time order, so consecutive rows share a day.
    const days: { heading: string; items: Reminder[] }[] = [];
    for (const reminder of once) {
        const heading = dayHeading(new Date(reminder.scheduled_time));
        const last = days[days.length - 1];
        if (last && last.heading === heading) last.items.push(reminder);
        else days.push({ heading, items: [reminder] });
    }

    return (
        <div className="grid gap-5">
            {days.map((day) => (
                <Group key={day.heading} heading={day.heading}>
                    {day.items.map((r) => (
                        <Row key={r.id} reminder={r} onDelete={onDelete} />
                    ))}
                </Group>
            ))}
            {repeating.length > 0 && (
                <Group heading="Repeating">
                    {repeating.map((r) => (
                        <Row key={r.id} reminder={r} repeating onDelete={onDelete} />
                    ))}
                </Group>
            )}
        </div>
    );
};
