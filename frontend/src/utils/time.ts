/**
 * Time display helpers.
 *
 * Everything is stored and sent as 24-hour ("17:00:00", or an ISO datetime) —
 * only the display is 12-hour, so nothing about the API or the database
 * changes.
 *
 * Written out rather than handed to toLocaleTimeString because that varies by
 * the viewer's locale: the same schedule would read "5:00 pm" for one person,
 * "17:00" for another, and the Telegram bot — which has no browser locale at
 * all — could not match either.
 */

/** "17:00:00" or "2026-09-07T17:00:00" -> "5:00 PM". */
export const formatTime = (value: string): string => {
    if (!value) return '';

    const timePart = value.includes('T') ? value.split('T')[1] : value;
    const [rawHours, rawMinutes] = timePart.split(':');

    const hours = Number(rawHours);
    if (Number.isNaN(hours)) return value;

    const suffix = hours < 12 ? 'AM' : 'PM';
    // 0 and 12 both display as 12 — midnight is 12 AM, noon is 12 PM.
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;

    return `${hour12}:${(rawMinutes ?? '00').slice(0, 2)} ${suffix}`;
};

/** "9:00 AM – 5:00 PM", for a block or a free slot. */
export const formatTimeRange = (start: string, end: string): string =>
    `${formatTime(start)} – ${formatTime(end)}`;

/**
 * 463 -> "7 hr 43 min". Raw minute counts stop being readable somewhere around
 * an hour: nobody converts "463 minutes" in their head.
 */
export const formatDuration = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
};

/**
 * 150 -> "2h 30m". Only for labels inside the timeline, where a free gap may
 * be a few dozen pixels wide and "2 hr 30 min" would not fit.
 */
export const formatDurationShort = (minutes: number): string => {
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** "17:00:00" -> 1020, minutes since midnight. */
export const toMinutes = (hhmmss: string): number => {
    const [h, m] = hhmmss.split(':').map(Number);
    return h * 60 + m;
};

/** 1020 -> "5:00 PM". */
export const minutesToClock = (minutes: number): string => {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return formatTime(`${h}:${String(m).padStart(2, '0')}`);
};
