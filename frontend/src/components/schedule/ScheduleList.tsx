import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { InlineConfirm } from '../ui/InlineConfirm';
import { ScheduleForm } from './ScheduleForm';
import type { DayOfWeek, ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate } from '../../types';

const DAYS: { id: DayOfWeek; label: string }[] = [
    { id: 'mon', label: 'Monday' },
    { id: 'tue', label: 'Tuesday' },
    { id: 'wed', label: 'Wednesday' },
    { id: 'thu', label: 'Thursday' },
    { id: 'fri', label: 'Friday' },
    { id: 'sat', label: 'Saturday' },
    { id: 'sun', label: 'Sunday' },
];

interface ScheduleListProps {
    blocks: ScheduleBlock[];
    onAddBlock: (day: DayOfWeek, data: ScheduleBlockCreate) => Promise<unknown>;
    onEditBlock: (id: string, data: ScheduleBlockUpdate) => Promise<unknown>;
    onDeleteBlock: (id: string) => Promise<unknown>;
}

export const ScheduleList: React.FC<ScheduleListProps> = ({ blocks, onAddBlock, onEditBlock, onDeleteBlock }) => {
    const [addingDay, setAddingDay] = useState<DayOfWeek | null>(null);
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

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

                return (
                    <div key={day.id} className="border border-border rounded-lg bg-card overflow-hidden">
                        <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                            <h3 className="font-semibold text-lg">{day.label}</h3>
                            <Button 
                                variant="secondary" 
                                className="text-sm px-3 py-1.5 h-auto"
                                onClick={() => {
                                    setAddingDay(day.id);
                                    setEditingBlockId(null);
                                }}
                            >
                                Add block
                            </Button>
                        </div>
                        
                        <div className="p-4 flex flex-col gap-3">
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
                                                        ? 'Flexible' 
                                                        : `${block.start_time?.substring(0,5)} - ${block.end_time?.substring(0,5)}`}
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
