import { useState } from 'react';
import { cn } from '../utils/cn';
import { formatDuration, formatDurationShort, minutesToClock } from '../utils/time';

export interface TimelineSegment {
    id: string;
    kind: 'committed' | 'free';
    label?: string;
    /** Minutes since midnight. */
    start: number;
    end: number;
}

interface TodayTimelineProps {
    segments: TimelineSegment[];
    /** The visible window, minutes since midnight (the user's day start/end). */
    windowStart: number;
    windowEnd: number;
    /** Current local time in minutes; null hides the "now" line. */
    nowMinutes: number | null;
}

const describe = (s: TimelineSegment) =>
    s.kind === 'free'
        ? `Free · ${minutesToClock(s.start)} – ${minutesToClock(s.end)} · ${formatDuration(s.end - s.start)}`
        : `${s.label ?? 'Busy'} · ${minutesToClock(s.start)} – ${minutesToClock(s.end)}`;

/** "6a", "12p" — tick labels have no room for ":00 AM". */
const tickLabel = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
};

/**
 * Which segments get a label inside them. The band is a container, so this
 * follows the band's own width, not the screen's: a 1-hour gap is ~20px wide
 * on a phone and ~55px on desktop.
 */
const labelVisibility = (s: TimelineSegment) => {
    const minutes = s.end - s.start;
    if (s.kind === 'committed') {
        if (minutes >= 180) return 'block';
        if (minutes >= 90) return 'hidden @lg:block';
        return 'hidden';
    }
    if (minutes >= 120) return 'block';
    if (minutes >= 60) return 'hidden @md:block';
    if (minutes >= 30) return 'hidden @3xl:block';
    return 'hidden';
};

/**
 * Today on one line (Design Brief 4.2): committed time solid, free time open
 * and outlined, a thin line at the current time. Every segment is a button so
 * a phone can tap for what hover shows on desktop.
 */
export const TodayTimeline = ({
    segments,
    windowStart,
    windowEnd,
    nowMinutes,
}: TodayTimelineProps) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const span = windowEnd - windowStart;
    const pct = (m: number) => ((Math.min(Math.max(m, windowStart), windowEnd) - windowStart) / span) * 100;

    const visible = segments.filter((s) => s.end > windowStart && s.start < windowEnd);
    const showNow = nowMinutes !== null && nowMinutes >= windowStart && nowMinutes <= windowEnd;

    const hours: number[] = [];
    for (let m = Math.ceil(windowStart / 60) * 60 + 60; m < windowEnd; m += 60) hours.push(m);

    const ticks: number[] = [];
    for (let m = Math.ceil(windowStart / 180) * 180; m <= windowEnd; m += 180) ticks.push(m);

    const selected =
        visible.find((s) => s.id === selectedId) ??
        (showNow ? visible.find((s) => s.start <= nowMinutes! && nowMinutes! < s.end) : undefined);
    const detail = selected
        ? `${selectedId === selected.id ? '' : 'Now · '}${describe(selected)}`
        : 'Tap a block for details.';

    return (
        <div className="@container">
            <div className="relative h-5" aria-hidden="true">
                {showNow && (
                    <span
                        className="absolute -translate-x-1/2 rounded-[6px] bg-[var(--color-ink)] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-[var(--color-bg)] whitespace-nowrap"
                        // Kept off the very edge so the tag never pokes out of the card.
                        style={{ left: `${Math.min(Math.max(pct(nowMinutes!), 7), 93)}%` }}
                    >
                        {minutesToClock(nowMinutes!)}
                    </span>
                )}
            </div>

            <div
                role="group"
                aria-label={`Today, ${minutesToClock(windowStart)} to ${minutesToClock(windowEnd)}`}
                className="relative h-[68px] @3xl:h-[80px] rounded-[10px] bg-[var(--color-surface-soft)] border border-[var(--color-border)] overflow-hidden"
            >
                {/* Faint hour lines, so a gap's length can be read at a glance. */}
                <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
                    {hours.map((m) => (
                        <span
                            key={m}
                            className="absolute top-0 bottom-0 w-px bg-[var(--color-border)]"
                            style={{ left: `${pct(m)}%` }}
                        />
                    ))}
                </div>
                {visible.map((s) => {
                    const left = pct(s.start);
                    const width = pct(s.end) - left;
                    const isSelected = selected?.id === s.id;
                    const isPast = nowMinutes !== null && s.end <= nowMinutes;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            aria-label={describe(s)}
                            aria-pressed={selectedId === s.id}
                            title={describe(s)}
                            onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
                            className={cn(
                                'absolute top-1.5 bottom-1.5 rounded-[8px] overflow-hidden px-1 flex flex-col items-center justify-center text-center transition-[filter,box-shadow] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--color-free)]',
                                s.kind === 'committed'
                                    ? 'bg-[var(--color-committed)] text-white hover:brightness-125'
                                    : 'bg-[var(--color-free-tint)] border border-[var(--color-free)] text-[var(--color-free)] hover:brightness-95',
                                isPast && 'opacity-55',
                                isSelected && 'ring-2 ring-[var(--color-free)] ring-offset-1',
                            )}
                            style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)` }}
                        >
                            <span className={cn('w-full truncate', labelVisibility(s))}>
                                {s.kind === 'committed' ? (
                                    <>
                                        <span className="block truncate font-inter text-[12px] @3xl:text-[13px] font-medium leading-tight">
                                            {s.label}
                                        </span>
                                        <span className="hidden @3xl:block truncate font-mono text-[11px] text-white/70 leading-tight">
                                            {minutesToClock(s.start)}–{minutesToClock(s.end)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="font-mono text-[11px] @3xl:text-[13px] font-medium">
                                        {formatDurationShort(s.end - s.start)}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}

                {showNow && (
                    <div
                        aria-hidden="true"
                        className="timeline-past absolute inset-y-0 left-0 pointer-events-none z-[5]"
                        style={{ width: `${pct(nowMinutes!)}%` }}
                    />
                )}

                {showNow && (
                    <div
                        aria-hidden="true"
                        className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--color-ink)] pointer-events-none z-10"
                        style={{ left: `${pct(nowMinutes!)}%` }}
                    />
                )}
            </div>

            <div className="relative h-5 mt-1" aria-hidden="true">
                {ticks.map((m) => (
                    <span
                        key={m}
                        className={cn(
                            'absolute font-mono text-[11px] text-[var(--color-ink-muted)]',
                            m === windowStart ? '' : m === windowEnd ? '-translate-x-full' : '-translate-x-1/2',
                        )}
                        style={{ left: `${pct(m)}%` }}
                    >
                        {tickLabel(m)}
                    </span>
                ))}
            </div>

            <p aria-live="polite" className="mt-2 font-mono text-[13px] text-[var(--color-ink-muted)] min-h-[18px]">
                {detail}
            </p>
        </div>
    );
};
