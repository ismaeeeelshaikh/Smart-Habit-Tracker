import React from 'react';
import type { Reminder, ReminderStatus } from '../../types';

/**
 * Status is display-only here by design: Done / Later / Skip are actioned from
 * Telegram in MVP (UX Flow Document Section 8), so these are labels, not
 * buttons.
 *
 * Every pill carries its word as well as its colour — colour alone is not an
 * accessible signal (Design Brief Section 9).
 */
const STATUS_STYLES: Record<ReminderStatus, { label: string; className: string }> = {
    pending: {
        label: 'Pending',
        className: 'text-[var(--color-ink-muted)] border border-[var(--color-border)]',
    },
    done: {
        label: 'Done',
        className: 'text-[var(--color-free)] bg-[var(--color-free)]/15',
    },
    later: {
        label: 'Later',
        className: 'text-[var(--color-priority-medium)] bg-[var(--color-priority-medium)]/15',
    },
    skipped: {
        label: 'Skipped',
        className: 'text-[var(--color-ink-muted)] bg-[var(--color-ink-muted)]/12',
    },
};

const StatusPill = ({ status }: { status: ReminderStatus }) => {
    const { label, className } = STATUS_STYLES[status];
    return (
        <span
            className={`inline-flex items-center px-[10px] py-[4px] rounded-full font-inter font-medium text-[12px] leading-none ${className}`}
        >
            {label}
        </span>
    );
};

/** "Tue 3 Sep, 19:00" — weekday included because reminders are time-of-day things. */
const formatWhen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

const RECURRENCE_LABEL: Record<string, string> = {
    daily: 'Repeats daily',
    weekdays: 'Repeats on weekdays',
};

interface ReminderListProps {
    reminders: Reminder[];
}

export const ReminderList: React.FC<ReminderListProps> = ({ reminders }) => (
    <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {reminders.map((reminder) => (
            <li
                key={reminder.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
            >
                <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                        <span className="text-[15px] font-inter">{reminder.label}</span>
                        {reminder.is_recurring && (
                            <span
                                className="text-[13px] text-[var(--color-ink-muted)]"
                                title={RECURRENCE_LABEL[reminder.recurrence_rule]}
                            >
                                <span aria-hidden="true">↻</span>
                                <span className="sr-only">
                                    {RECURRENCE_LABEL[reminder.recurrence_rule]}
                                </span>
                            </span>
                        )}
                    </div>
                    <div className="text-[13px] text-[var(--color-ink-muted)]">
                        {formatWhen(reminder.scheduled_time)}
                    </div>
                </div>
                <StatusPill status={reminder.status} />
            </li>
        ))}
    </ul>
);
