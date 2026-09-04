import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { DayOfWeek, ScheduleBlockCreate, ScheduleBlockUpdate } from '../../types';

interface ScheduleFormProps {
    dayOfWeek: DayOfWeek;
    initialData?: ScheduleBlockUpdate & { id?: string };
    onSubmit: (data: ScheduleBlockCreate | ScheduleBlockUpdate) => Promise<unknown>;
    onCancel: () => void;
}

export const ScheduleForm: React.FC<ScheduleFormProps> = ({ dayOfWeek, initialData, onSubmit, onCancel }) => {
    const [label, setLabel] = useState(initialData?.label || '');
    const [isFlexible, setIsFlexible] = useState(initialData?.is_flexible_block || false);
    const [startTime, setStartTime] = useState(initialData?.start_time || '');
    const [endTime, setEndTime] = useState(initialData?.end_time || '');
    
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!label.trim()) {
            setError('Label is required');
            return;
        }

        if (!isFlexible) {
            if (!startTime || !endTime) {
                setError('Start and end times are required for fixed blocks');
                return;
            }
            if (startTime >= endTime) {
                setError('End time must be after start time');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await onSubmit({
                day_of_week: dayOfWeek,
                label,
                is_flexible_block: isFlexible,
                start_time: isFlexible ? null : (startTime.length === 5 ? startTime + ':00' : startTime),
                end_time: isFlexible ? null : (endTime.length === 5 ? endTime + ':00' : endTime),
            });
        } catch (err: any) {
            setError(err.message || 'Failed to save block');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border border-border bg-card rounded-lg mt-2">
            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Label (e.g. College, Gym)</label>
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Commitment name"
                    required
                />
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-foreground">
                <input
                    type="checkbox"
                    checked={isFlexible}
                    onChange={(e) => setIsFlexible(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                />
                Flexible / no fixed time
            </label>

            {!isFlexible && (
                <div className="flex gap-4">
                    <div className="flex-1 flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">Start Time</label>
                        <Input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            required={!isFlexible}
                        />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground">End Time</label>
                        <Input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            required={!isFlexible}
                        />
                    </div>
                </div>
            )}

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <div className="flex gap-2 justify-end mt-2">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting}>
                    Save block
                </Button>
            </div>
        </form>
    );
};
