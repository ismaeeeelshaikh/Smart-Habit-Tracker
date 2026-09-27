import { useEffect, useState } from 'react';
import type { DayOfWeek } from '../types';

export interface LocalNow {
    /** Minutes since local midnight, in the user's timezone. */
    minutes: number;
    weekday: DayOfWeek;
    /** "Sunday, 27 Sep". */
    dateLabel: string;
    /** "2026-09-27", to compare with the dates the API sends. */
    isoDate: string;
}

const WEEKDAYS: Record<string, DayOfWeek> = {
    Mon: 'mon',
    Tue: 'tue',
    Wed: 'wed',
    Thu: 'thu',
    Fri: 'fri',
    Sat: 'sat',
    Sun: 'sun',
};

const formatterFor = (timezone: string, options: Intl.DateTimeFormatOptions) => {
    try {
        return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: timezone });
    } catch {
        // An unknown zone name throws; the backend falls back to UTC in the
        // same case, so the two stay in step.
        return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' });
    }
};

/** "2026-09-27" in the given zone; picked by part type, not locale order. */
const isoDateIn = (timezone: string, at: Date): string => {
    const p = Object.fromEntries(
        formatterFor(timezone, { year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(at)
            .map((part) => [part.type, part.value]),
    );
    return `${p.year}-${p.month}-${p.day}`;
};

/**
 * The wall-clock time where the user lives, not where the browser is — a
 * schedule block means "09:00 in my timezone", same as on the backend.
 */
export const readLocalNow = (timezone: string, at: Date = new Date()): LocalNow => {
    const parts = Object.fromEntries(
        formatterFor(timezone, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(at)
            .map((p) => [p.type, p.value]),
    );

    const date = Object.fromEntries(
        formatterFor(timezone, { weekday: 'long', day: 'numeric', month: 'short' })
            .formatToParts(at)
            .map((p) => [p.type, p.value]),
    );

    return {
        // hourCycle h23 still prints midnight as "24" in some engines.
        minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
        weekday: WEEKDAYS[parts.weekday] ?? 'mon',
        dateLabel: `${date.weekday}, ${date.day} ${date.month}`,
        isoDate: isoDateIn(timezone, at),
    };
};

/** Re-renders on each minute boundary, so the "now" line keeps moving. */
export const useNow = (timezone: string): LocalNow => {
    const [now, setNow] = useState(() => readLocalNow(timezone));

    useEffect(() => {
        const tick = () => setNow(readLocalNow(timezone));
        tick();

        let interval: ReturnType<typeof setInterval> | undefined;
        const untilNextMinute = 60_000 - (Date.now() % 60_000);
        const timeout = setTimeout(() => {
            tick();
            interval = setInterval(tick, 60_000);
        }, untilNextMinute);

        return () => {
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [timezone]);

    return now;
};
