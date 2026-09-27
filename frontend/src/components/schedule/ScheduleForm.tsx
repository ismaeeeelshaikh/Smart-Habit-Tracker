import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type {
    DayOfWeek,
    FlexibleAvailability,
    ScheduleBlockCreate,
    ScheduleBlockUpdate,
} from '../../types';

/** Minutes of warning a new block gets unless the user says otherwise.
 *
 * A notice at the moment a lecture starts is already too late to act on, and
 * the old default — no warning at all — meant most blocks quietly never warned
 * anyone. Ten minutes is enough to put a bag together and go.
 */
const DEFAULT_REMIND_BEFORE = 10;
const MAX_REMIND_BEFORE = 240;

interface ScheduleFormProps {
    dayOfWeek: DayOfWeek;
    /** 'block' is a timed commitment; 'day' marks the whole day, with no clock. */
    mode?: 'block' | 'day';
    initialData?: ScheduleBlockUpdate & { id?: string };
    onSubmit: (data: ScheduleBlockCreate | ScheduleBlockUpdate) => Promise<unknown>;
    onCancel: () => void;
}

export const ScheduleForm: React.FC<ScheduleFormProps> = ({
    dayOfWeek,
    mode,
    initialData,
    onSubmit,
    onCancel,
}) => {
    // Editing decides for itself: a whole-day entry always opens as one.
    const isWholeDay = initialData ? Boolean(initialData.is_flexible_block) : mode === 'day';

    const [label, setLabel] = useState(initialData?.label || '');
    const [startTime, setStartTime] = useState(initialData?.start_time || '');
    const [endTime, setEndTime] = useState(initialData?.end_time || '');
    // A whole-day entry means one of two opposite things, so the user says which.
    const [availability, setAvailability] = useState<FlexibleAvailability>(
        initialData?.flexible_availability || 'busy',
    );

    // New blocks warn by default; an existing one keeps whatever it was saved with.
    const [remindEnabled, setRemindEnabled] = useState(
        initialData ? initialData.remind_before_minutes != null : true,
    );
    const [remindBefore, setRemindBefore] = useState(
        String(initialData?.remind_before_minutes ?? DEFAULT_REMIND_BEFORE),
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

        const minutes = Number(remindBefore);
        if (!isWholeDay) {
            if (!startTime || !endTime) {
                setError('Start and end times are required.');
                return;
            }
            if (startTime >= endTime) {
                setError('End time must be after start time.');
                return;
            }
            // 0 is "as it starts"; blank is not a number of minutes at all.
            if (
                remindEnabled &&
                (remindBefore.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_REMIND_BEFORE)
            ) {
                setError(`Remind me between 0 and ${MAX_REMIND_BEFORE} minutes before (0 means as it starts).`);
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await onSubmit({
                day_of_week: dayOfWeek,
                label,
                is_flexible_block: isWholeDay,
                start_time: isWholeDay ? null : (startTime.length === 5 ? startTime + ':00' : startTime),
                end_time: isWholeDay ? null : (endTime.length === 5 ? endTime + ':00' : endTime),
                flexible_availability: isWholeDay ? availability : null,
                // A whole day has no start time to count back from.
                remind_before_minutes: isWholeDay || !remindEnabled ? null : minutes,
            });
        } catch (err: any) {
            setError(err.message || "Couldn't save that. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border border-border bg-card rounded-lg mt-2">
            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="block-label">
                    {isWholeDay ? 'What is this day? (e.g. Diwali, Rest day)' : 'Label (e.g. Work, Gym)'}
                </label>
                <Input
                    id="block-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={isWholeDay ? 'Day name…' : 'Commitment name…'}
                    name="block-label"
                    autoComplete="off"
                    required
                />
            </div>

            {isWholeDay ? (
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
            ) : (
                <>
                    <div className="flex gap-4">
                        <div className="flex-1 flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-foreground" htmlFor="start-time">
                                Start Time
                            </label>
                            <Input
                                id="start-time"
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex-1 flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-foreground" htmlFor="end-time">
                                End Time
                            </label>
                            <Input
                                id="end-time"
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={remindEnabled}
                                onChange={(e) => setRemindEnabled(e.target.checked)}
                                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                            />
                            Remind me
                        </label>
                        <Input
                            aria-label="Minutes before it starts"
                            type="number"
                            min={0}
                            max={MAX_REMIND_BEFORE}
                            value={remindBefore}
                            disabled={!remindEnabled}
                            onChange={(e) => setRemindBefore(e.target.value)}
                            className="w-20"
                        />
                        <span className="font-normal text-[var(--color-ink-muted)]">
                            minutes before it starts (0 = as it starts)
                        </span>
                    </div>
                </>
            )}

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <div className="flex gap-2 justify-end mt-2">
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
