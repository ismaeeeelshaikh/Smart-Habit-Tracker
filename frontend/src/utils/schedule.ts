import type { DayOfWeek, ScheduleBlock } from '../types';
import { toMinutes } from './time';

export const WEEKDAYS: { id: DayOfWeek; short: string; long: string }[] = [
    { id: 'mon', short: 'Mon', long: 'Monday' },
    { id: 'tue', short: 'Tue', long: 'Tuesday' },
    { id: 'wed', short: 'Wed', long: 'Wednesday' },
    { id: 'thu', short: 'Thu', long: 'Thursday' },
    { id: 'fri', short: 'Fri', long: 'Friday' },
    { id: 'sat', short: 'Sat', long: 'Saturday' },
    { id: 'sun', short: 'Sun', long: 'Sunday' },
];

export interface Span {
    start: number;
    end: number;
}

/**
 * One day's busy stretches inside the user's day window, overlaps merged, in
 * minutes since midnight. A whole-day "committed" block covers the window.
 *
 * Display only — the free slots the scheduler acts on still come from the
 * backend's slot engine.
 */
export const busySpans = (
    blocks: ScheduleBlock[],
    day: DayOfWeek,
    windowStart: number,
    windowEnd: number,
): Span[] => {
    const forDay = blocks.filter((b) => b.day_of_week === day);
    if (forDay.some((b) => b.is_flexible_block && b.flexible_availability === 'busy')) {
        return [{ start: windowStart, end: windowEnd }];
    }

    const spans = forDay
        .filter((b) => !b.is_flexible_block && b.start_time && b.end_time)
        .map((b) => ({
            start: Math.max(windowStart, toMinutes(b.start_time!)),
            end: Math.min(windowEnd, toMinutes(b.end_time!)),
        }))
        .filter((s) => s.end > s.start)
        .sort((a, b) => a.start - b.start);

    const merged: Span[] = [];
    for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
        else merged.push({ ...s });
    }
    return merged;
};

export const totalMinutes = (spans: Span[]) => spans.reduce((sum, s) => sum + (s.end - s.start), 0);
