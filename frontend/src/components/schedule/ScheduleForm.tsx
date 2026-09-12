import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type {
    DayOfWeek,
    FlexibleAvailability,
    ScheduleBlockCreate,
    ScheduleBlockUpdate,
} from '../../types';

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
    // A flexible block means one of two opposite things, so the user says which.
    const [availability, setAvailability] = useState<FlexibleAvailability>(
        initialData?.flexible_availability || 'busy',
    );

    const [remindBefore, setRemindBefore] = useState(
        initialData?.remind_before_minutes?.toString() ?? '',
    );
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!label.trim()) {
            setError('Label is required.');
            return;
        }

        if (!isFlexible) {
            if (!startTime || !endTime) {
                setError('Start and end times are required for fixed blocks.');
                return;
            }
            if (startTime >= endTime) {
                setError('End time must be after start time.');
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
                flexible_availability: isFlexible ? availability : null,
                // Blank means stay quiet, which is the default: a schedule is
                // mostly a record of when *not* to interrupt someone.
                remind_before_minutes:
                    isFlexible || remindBefore === '' ? null : Number(remindBefore),
            });
        } catch (err: any) {
            setError(err.message || "Couldn't save that block. Please try again.");
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

            {isFlexible && (
                <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium text-foreground mb-1">
                        On this day I'm
                    </legend>
                    <label className="flex items-start gap-2 cursor-pointer select-none text-sm">
                        <input
                            type="radio"
                            name="flexible-availability"
                            value="busy"
                            checked={availability === 'busy'}
                            onChange={() => setAvailability('busy')}
                            className="mt-1 h-4 w-4"
                        />
                        <span>
                            Committed
                            <span className="block text-[13px] text-[var(--color-ink-muted)]">
                                Loosely booked, like family time — we won't suggest anything.
                            </span>
                        </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer select-none text-sm">
                        <input
                            type="radio"
                            name="flexible-availability"
                            value="free"
                            checked={availability === 'free'}
                            onChange={() => setAvailability('free')}
                            className="mt-1 h-4 w-4"
                        />
                        <span>
                            Mostly free
                            <span className="block text-[13px] text-[var(--color-ink-muted)]">
                                A note to yourself — the whole day stays open for suggestions.
                            </span>
                        </span>
                    </label>
                </fieldset>
            )}

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

            {!isFlexible && (
                <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground" htmlFor="remind-before">
                        Remind me before it starts
                    </label>
                    <select
                        id="remind-before"
                        value={remindBefore}
                        onChange={(e) => setRemindBefore(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <option value="">Don't remind me</option>
                        <option value="5">5 minutes before</option>
                        <option value="10">10 minutes before</option>
                        <option value="15">15 minutes before</option>
                        <option value="30">30 minutes before</option>
                        <option value="60">1 hour before</option>
                    </select>
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
