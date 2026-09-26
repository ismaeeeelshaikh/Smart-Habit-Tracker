import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { InlineConfirm } from '../ui/InlineConfirm';
import { ScheduleForm } from './ScheduleForm';
import type { DayOfWeek, ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate } from '../../types';
import { formatTimeRange } from '../../utils/time';

const DAYS: { id: DayOfWeek; label: string }[] = [
    { id: 'mon', label: 'Monday' },
    { id: 'tue', label: 'Tuesday' },
    { id: 'wed', label: 'Wednesday' },
    { id: 'thu', label: 'Thursday' },
    { id: 'fri', label: 'Friday' },
    { id: 'sat', label: 'Saturday' },
    { id: 'sun', label: 'Sunday' },
];

/** Today's day key, in the same order as the list above (Monday first). */
const todayKey = (): DayOfWeek => DAYS[(new Date().getDay() + 6) % 7].id;

interface ScheduleListProps {
    blocks: ScheduleBlock[];
    onAddBlock: (day: DayOfWeek, data: ScheduleBlockCreate) => Promise<unknown>;
    onEditBlock: (id: string, data: ScheduleBlockUpdate) => Promise<unknown>;
    onDeleteBlock: (id: string) => Promise<unknown>;
    /** Weekdays switched off in Quiet days, marked on their headers. */
    quietDays?: DayOfWeek[];
}

export const ScheduleList: React.FC<ScheduleListProps> = ({
    blocks,
    onAddBlock,
    onEditBlock,
    onDeleteBlock,
    quietDays = [],
}) => {
    const [addingDay, setAddingDay] = useState<DayOfWeek | null>(null);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    // A real week is dozens of blocks; only today starts open so the page stays
    // a list of days rather than one long scroll.
    const [openDays, setOpenDays] = useState<Set<DayOfWeek>>(() => new Set([todayKey()]));

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

    return (
        <div className="flex flex-col gap-6">
            {DAYS.map(day => {
                const dayBlocks = blocks.filter(b => b.day_of_week === day.id);
                // Sort blocks: fixed first (by start_time), then flexible
                dayBlocks.sort((a, b) => {
                    if (a.is_flexible_block && !b.is_flexible_block) return 1;
                    if (!a.is_flexible_block && b.is_flexible_block) return -1;
                    if (a.start_time && b.start_time) {
                        return a.start_time.localeCompare(b.start_time);
                    }
                    return 0;
                });

                const isOpen = openDays.has(day.id);
                const panelId = `schedule-day-${day.id}`;

                return (
                    <div key={day.id} className="border border-border rounded-lg bg-card overflow-hidden">
                        <div
                            className={`flex flex-wrap items-center justify-between gap-2 p-4 bg-muted/30 ${
                                isOpen ? 'border-b border-border' : ''
                            }`}
                        >
                            <h3 className="font-semibold text-lg">
                                <button
                                    type="button"
                                    onClick={() => setOpen(day.id, !isOpen)}
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
                                >
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={`h-5 w-5 transition-transform motion-reduce:transition-none ${
                                            isOpen ? '' : '-rotate-90'
                                        }`}
                                    />
                                    {day.label}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        {dayBlocks.length === 0
                                            ? '· free'
                                            : `· ${dayBlocks.length} ${dayBlocks.length === 1 ? 'block' : 'blocks'}`}
                                    </span>
                                    {quietDays.includes(day.id) && (
                                        <span className="text-xs font-medium rounded-full border border-[var(--color-border)] px-2 py-0.5 text-muted-foreground">
                                            quiet
                                        </span>
                                    )}
                                </button>
                            </h3>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    className="text-sm px-3 py-1.5 h-auto"
                                    onClick={() => startAdding(day.id)}
                                >
                                    Add block
                                </Button>
                            </div>
                        </div>
                        
                        <div id={panelId} hidden={!isOpen} className="p-4 flex flex-col gap-3">
                            {dayBlocks.length === 0 && addingDay !== day.id && (
                                <p className="text-muted-foreground text-sm py-2">
                                    No commitments on {day.label}. Add one or leave it free.
                                </p>
                            )}

                            {dayBlocks.map(block => (
                                <div key={block.id}>
                                    {editingBlockId === block.id ? (
                                        <ScheduleForm
                                            dayOfWeek={day.id}
                                            initialData={block}
                                            onSubmit={(data) => handleEditSubmit(block.id, data)}
                                            onCancel={() => setEditingBlockId(null)}
                                        />
                                    ) : (
                                        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-background hover:border-primary/50 transition-colors">
                                            <div>
                                                <p className="font-medium">{block.label}</p>
                                                <p className="text-sm text-muted-foreground mt-0.5">
                                                    {block.is_flexible_block
                                                        ? block.flexible_availability === 'free'
                                                            ? 'Whole day — mostly free'
                                                            : 'Whole day — committed'
                                                        : formatTimeRange(block.start_time ?? '', block.end_time ?? '')}
                                                    {!block.is_flexible_block && block.remind_before_minutes != null && (
                                                        <span>
                                                            {' · '}
                                                            {block.remind_before_minutes === 0
                                                                ? 'reminder as it starts'
                                                                : `reminder ${block.remind_before_minutes} min before`}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    variant="secondary" 
                                                    className="text-sm px-3 py-1.5 h-auto"
                                                    onClick={() => {
                                                        setEditingBlockId(block.id);
                                                        setAddingDay(null);
                                                    }}
                                                >
                                                    Edit
                                                </Button>
                                                <InlineConfirm
                                                    promptMessage="Delete this block?"
                                                    confirmLabel="Yes, remove"
                                                    onConfirm={async () => {
                                                        await onDeleteBlock(block.id);
                                                    }}
                                                >
                                                    <Button variant="secondary" className="text-sm px-3 py-1.5 h-auto">Delete</Button>
                                                </InlineConfirm>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {addingDay === day.id && (
                                <ScheduleForm
                                    dayOfWeek={day.id}
                                    onSubmit={(data) => handleAddSubmit(day.id, data)}
                                    onCancel={() => setAddingDay(null)}
                                />
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
