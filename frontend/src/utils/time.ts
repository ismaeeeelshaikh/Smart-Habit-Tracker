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
