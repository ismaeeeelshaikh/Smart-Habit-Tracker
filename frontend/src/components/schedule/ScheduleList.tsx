import React, { useState } from 'react';
import { Bell, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { InlineConfirm } from '../ui/InlineConfirm';
import { ScheduleForm } from './ScheduleForm';
import type { DayOfWeek, ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate } from '../../types';
import { cn } from '../../utils/cn';
import { busySpans, totalMinutes, WEEKDAYS } from '../../utils/schedule';
import { formatDuration, formatTime } from '../../utils/time';

/** Today's day key, in the same order as the list above (Monday first). */
const todayKey = (): DayOfWeek => WEEKDAYS[(new Date().getDay() + 6) % 7].id;

interface ScheduleListProps {
    blocks: ScheduleBlock[];
    onAddBlock: (day: DayOfWeek, data: ScheduleBlockCreate) => Promise<unknown>;
    onEditBlock: (id: string, data: ScheduleBlockUpdate) => Promise<unknown>;
    onDeleteBlock: (id: string) => Promise<unknown>;
    /** Weekdays switched off in Quiet days, marked on their headers. */
    quietDays?: DayOfWeek[];
    /** The user's day window, for each day's busy bar. Defaults to 6 AM–11 PM. */
    windowStart?: number;
    windowEnd?: number;
}

const iconButton =
    'grid h-10 w-10 place-items-center rounded-[10px] text-[var(--color-ink-muted)] transition-colors touch-manipulation hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]';

const reminderText = (minutes: number) =>
    minutes === 0 ? 'reminder as it starts' : `reminder ${minutes} min before`;

export const ScheduleList: React.FC<ScheduleListProps> = ({
    blocks,
    onAddBlock,
    onEditBlock,
    onDeleteBlock,
    quietDays = [],
    windowStart = 6 * 60,
    windowEnd = 23 * 60,
}) => {
    const [addingDay, setAddingDay] = useState<DayOfWeek | null>(null);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const today = todayKey();
    // A real week is dozens of blocks; only today starts open so the page stays
    // a list of days rather than one long scroll.
    const [openDays, setOpenDays] = useState<Set<DayOfWeek>>(() => new Set([today]));

    const setOpen = (day: DayOfWeek, open: boolean) =>
        setOpenDays((prev) => {
            const next = new Set(prev);
            if (open) next.add(day);
            else next.delete(day);
            return next;
        });

    const startAdding = (day: DayOfWeek) => {
        setOpen(day, true);
        setAddingDay(day);
        setEditingBlockId(null);
    };

    const handleAddSubmit = async (day: DayOfWeek, data: ScheduleBlockCreate | ScheduleBlockUpdate) => {
        await onAddBlock(day, data as ScheduleBlockCreate);
        setAddingDay(null);
    };

    const handleEditSubmit = async (id: string, data: ScheduleBlockCreate | ScheduleBlockUpdate) => {
        await onEditBlock(id, data as ScheduleBlockUpdate);
        setEditingBlockId(null);
    };

    const span = windowEnd - windowStart;
    const pct = (m: number) => ((m - windowStart) / span) * 100;

    return (
        <div className="flex flex-col gap-3">
            {WEEKDAYS.map((day) => {
                const dayBlocks = blocks.filter((b) => b.day_of_week === day.id);
                // Sort blocks: fixed first (by start_time), then flexible
                dayBlocks.sort((a, b) => {
                    if (a.is_flexible_block && !b.is_flexible_block) return 1;
                    if (!a.is_flexible_block && b.is_flexible_block) return -1;
                    if (a.start_time && b.start_time) {
                        return a.start_time.localeCompare(b.start_time);
                    }
                    return 0;
                });

                const busy = busySpans(blocks, day.id, windowStart, windowEnd);
                const isOpen = openDays.has(day.id);
                const isToday = day.id === today;
                const panelId = `schedule-day-${day.id}`;

                return (
                    <div
                        key={day.id}
                        className={cn(
                            'border rounded-[16px] bg-[var(--color-surface)] overflow-hidden',
                            isToday
                                ? 'border-[color-mix(in_srgb,var(--color-free)_55%,var(--color-border))]'
                                : 'border-[var(--color-border)]',
                        )}
                    >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3">
                            <h3 className="min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setOpen(day.id, !isOpen)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-[8px] text-left min-h-[44px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                                >
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={cn(
                                            'h-5 w-5 shrink-0 text-[var(--color-ink-muted)] transition-transform motion-reduce:transition-none',
                                            !isOpen && '-rotate-90',
                                        )}
                                    />
                                    <span className="font-display text-[16px] font-semibold text-[var(--color-ink)]">
                                        {day.long}
                                    </span>
                                    <span className="font-inter text-[13px] font-normal text-[var(--color-ink-muted)] whitespace-nowrap">
                                        {dayBlocks.length === 0
                                            ? '· free'
                                            : `· ${dayBlocks.length} ${dayBlocks.length === 1 ? 'block' : 'blocks'}`}
                                    </span>
                                    {isToday && (
                                        <span className="rounded-full bg-[var(--color-free)] px-2 py-1 font-display text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--color-on-free)]">
                                            Today
                                        </span>
                                    )}
                                    {quietDays.includes(day.id) && (
                                        <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-inter text-[11px] font-medium text-[var(--color-ink-muted)]">
                                            quiet
                                        </span>
                                    )}
                                </button>
                            </h3>
                            <button
                                type="button"
                                onClick={() => startAdding(day.id)}
                                className="inline-flex min-h-[40px] items-center gap-1 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 font-inter text-[13px] font-semibold text-[var(--color-ink)] transition-colors touch-manipulation hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                            >
                                <Plus aria-hidden="true" className="h-4 w-4" />
                                Add block
                            </button>

                            {/* The day at a glance, readable even while folded. */}
                            <div aria-hidden="true" className="col-span-2 grid gap-1">
                                <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--color-free-tint)]">
                                    {busy.map((s) => (
                                        <span
                                            key={s.start}
                                            className="absolute inset-y-0 rounded-[3px] bg-[var(--color-committed)]"
                                            style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }}
                                        />
                                    ))}
                                </div>
                                <div className="flex justify-between font-mono text-[11px] text-[var(--color-ink-muted)]">
                                    <span>{formatTime(`${Math.floor(windowStart / 60)}:${String(windowStart % 60).padStart(2, '0')}`)}</span>
                                    <span>{busy.length ? `${formatDuration(totalMinutes(busy))} busy` : 'all free'}</span>
                                    <span>{formatTime(`${Math.floor(windowEnd / 60) % 24}:${String(windowEnd % 60).padStart(2, '0')}`)}</span>
                                </div>
                            </div>
                        </div>

                        <div
                            id={panelId}
                            hidden={!isOpen}
                            className="border-t border-[var(--color-border)] px-4 pb-4 pt-1 flex flex-col"
                        >
                            {dayBlocks.length === 0 && addingDay !== day.id && (
                                <p className="text-[var(--color-ink-muted)] text-[13px] pt-3">
                                    No commitments on {day.long}. Add one or leave it free.
                                </p>
                            )}

                            {dayBlocks.map((block) => (
                                <div
                                    key={block.id}
                                    className="border-b border-dashed border-[var(--color-border)] last:border-b-0"
                                >
                                    {editingBlockId === block.id ? (
                                        <div className="py-3">
                                            <ScheduleForm
                                                dayOfWeek={day.id}
                                                initialData={block}
                                                onSubmit={(data) => handleEditSubmit(block.id, data)}
                                                onCancel={() => setEditingBlockId(null)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-[64px_3px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                                            <p className="text-right font-mono text-[12px] font-medium leading-snug text-[var(--color-ink)]">
                                                {block.is_flexible_block ? (
                                                    'All day'
                                                ) : (
                                                    <>
                                                        {formatTime(block.start_time ?? '')}
                                                        <span className="block font-normal text-[var(--color-ink-muted)]">
                                                            {formatTime(block.end_time ?? '')}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'self-stretch rounded-full',
                                                    block.is_flexible_block && block.flexible_availability === 'free'
                                                        ? 'bg-[var(--color-free)]'
                                                        : 'bg-[var(--color-committed)]',
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <p className="font-inter text-[15px] font-medium text-[var(--color-ink)] break-words">
                                                    {block.label}
                                                </p>
                                                {block.is_flexible_block ? (
                                                    <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
                                                        {block.flexible_availability === 'free'
                                                            ? 'Whole day — mostly free'
                                                            : 'Whole day — committed'}
                                                    </p>
                                                ) : (
                                                    block.remind_before_minutes != null && (
                                                        <p className="mt-1 inline-flex items-center gap-1 font-mono text-[12px] text-[var(--color-ink-muted)]">
                                                            <Bell aria-hidden="true" className="h-3 w-3" />
                                                            {reminderText(block.remind_before_minutes)}
                                                        </p>
                                                    )
                                                )}
                                            </div>
                                            <div className="flex items-center">
                                                <button
                                                    type="button"
                                                    className={iconButton}
                                                    aria-label={`Edit ${block.label}`}
                                                    title="Edit"
                                                    onClick={() => {
                                                        setEditingBlockId(block.id);
                                                        setAddingDay(null);
                                                    }}
                                                >
                                                    <Pencil aria-hidden="true" className="h-4 w-4" />
                                                </button>
                                                <InlineConfirm
                                                    promptMessage="Delete this block?"
                                                    confirmLabel="Yes, remove"
                                                    onConfirm={async () => {
                                                        await onDeleteBlock(block.id);
                                                    }}
                                                >
                                                    {/* InlineConfirm is the button; this is only its face. */}
                                                    <span className={cn(iconButton, 'hover:text-[var(--color-error)]')} title="Delete">
                                                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                                                    </span>
                                                </InlineConfirm>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {addingDay === day.id && (
                                <div className="pt-3">
                                    <ScheduleForm
                                        dayOfWeek={day.id}
                                        onSubmit={(data) => handleAddSubmit(day.id, data)}
                                        onCancel={() => setAddingDay(null)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
