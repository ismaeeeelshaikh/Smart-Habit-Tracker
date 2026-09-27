import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { WeekBars } from '../components/dashboard/WeekBars';
import { getWeeklyStats } from '../api';
import type { CompletionTally, Priority, WeeklyStats } from '../types';

const PRIORITIES: { key: Priority; label: string; color: string }[] = [
    { key: 'high', label: 'High', color: 'var(--color-priority-high)' },
    { key: 'medium', label: 'Medium', color: 'var(--color-priority-medium)' },
    { key: 'low', label: 'Low', color: 'var(--color-priority-low)' },
];

/** "7 Sep" — short, because it sits beside another date. */
const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Local date as YYYY-MM-DD, without the UTC shift toISOString would add. */
const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return localIso(d);
};

const isoWeekStart = (d = new Date()) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return localIso(copy);
};

const RING = 72;
const STROKE = 7;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** One priority tier as a ring: the share of its reminders that got done. */
const PriorityStat = ({ label, color, tally }: { label: string; color: string; tally: CompletionTally }) => {
    const empty = tally.total === 0;
    return (
        <Card className="rounded-[16px] p-3 sm:p-5 grid justify-items-center gap-2 text-center">
            <div
                className="relative"
                role="img"
                aria-label={
                    empty
                        ? `${label} priority: nothing yet`
                        : `${label} priority: ${tally.completion_rate}% completed, ${tally.completed} of ${tally.total}`
                }
            >
                <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden="true">
                    <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth={STROKE} />
                    {!empty && (
                        <circle
                            cx={RING / 2}
                            cy={RING / 2}
                            r={RADIUS}
                            fill="none"
                            stroke={color}
                            strokeWidth={STROKE}
                            strokeLinecap="round"
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={CIRCUMFERENCE * (1 - tally.completion_rate / 100)}
                            className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
                        />
                    )}
                </svg>
                <span
                    aria-hidden="true"
                    className="absolute inset-0 grid place-items-center font-mono text-[17px] font-semibold text-[var(--color-ink)]"
                >
                    {empty ? '—' : `${tally.completion_rate}%`}
                </span>
            </div>
            <h3 className="font-display text-[14px] font-semibold" style={{ color }}>
                {label}
            </h3>
            <p className="text-[12px] leading-tight text-[var(--color-ink-muted)]">
                {empty ? 'Nothing yet' : `${tally.completed} of ${tally.total} completed`}
            </p>
        </Card>
    );
};

const weekButton =
    'grid h-10 w-10 place-items-center rounded-full text-[var(--color-ink)] transition-colors touch-manipulation hover:bg-[var(--color-surface-soft)] disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]';

export const Stats = () => {
    const [weekStart, setWeekStart] = useState(isoWeekStart);
    const [stats, setStats] = useState<WeeklyStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            setStats(await getWeeklyStats(weekStart));
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't load stats for this week.");
        } finally {
            setIsLoading(false);
        }
    }, [weekStart]);

    useEffect(() => {
        load();
    }, [load]);

    // Next week holds nothing yet, so there is nowhere useful to navigate to.
    const isCurrentWeek = weekStart >= isoWeekStart();

    return (
        <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 max-w-[720px] mx-auto mb-12">
            <header>
                <h1 className="font-display font-semibold text-[26px] leading-[32px] sm:text-[28px] text-[var(--color-ink)]">
                    Stats
                </h1>
                <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">How your week went</p>
            </header>

            <div className="flex items-center justify-between gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                <button
                    type="button"
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                    aria-label="Previous week"
                    className={weekButton}
                >
                    <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                </button>

                <p className="flex items-center gap-2 font-mono text-[14px] font-medium text-[var(--color-ink)]">
                    {stats
                        ? `${shortDate(stats.week_start)} – ${shortDate(stats.week_end)}`
                        : shortDate(weekStart)}
                    {isCurrentWeek && (
                        <span className="rounded-full bg-[var(--color-free-tint)] px-2 py-1 font-display text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[var(--color-free)]">
                            This week
                        </span>
                    )}
                </p>

                <button
                    type="button"
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                    disabled={isCurrentWeek}
                    aria-label="Next week"
                    className={weekButton}
                >
                    <ChevronRight aria-hidden="true" className="h-5 w-5" />
                </button>
            </div>

            {error ? (
                <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
                    <p>Couldn't load stats for this week.</p>
                    <button
                        onClick={load}
                        className="min-h-[44px] font-medium text-[var(--color-free)] hover:brightness-90 transition-all"
                    >
                        Retry
                    </button>
                </div>
            ) : isLoading ? (
                <div className="flex justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-free)]" />
                </div>
            ) : stats && stats.total_actions === 0 ? (
                // Per-week, not a blanket empty state: an earlier week may well
                // have data, so the message shouldn't imply there is none at all.
                <div className="rounded-[16px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                    <p className="text-[15px] text-[var(--color-ink-muted)]">No activity recorded for this week.</p>
                </div>
            ) : (
                stats && (
                    <div className="space-y-5 sm:space-y-6">
                        <Card className="rounded-[16px] p-4 sm:p-6">
                            <section aria-labelledby="week-summary" className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-6">
                                <div>
                                    <h2
                                        id="week-summary"
                                        className="font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]"
                                    >
                                        Done this week
                                    </h2>
                                    <p className="mt-2 font-mono text-[44px] font-semibold leading-none tracking-[-0.03em] text-[var(--color-ink)]">
                                        {stats.overall.completion_rate}%
                                    </p>
                                    <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
                                        <span className="font-mono">
                                            {stats.overall.completed} of {stats.overall.total}
                                        </span>{' '}
                                        done
                                    </p>
                                </div>
                                {stats.by_day?.length === 7 ? (
                                    <WeekBars days={stats.by_day} todayIso={localIso(new Date())} />
                                ) : (
                                    <span />
                                )}
                            </section>
                        </Card>

                        <section aria-label="By priority" className="grid gap-2">
                            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                By priority
                            </h2>
                            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                                {PRIORITIES.map(({ key, label, color }) => (
                                    <PriorityStat key={key} label={label} color={color} tally={stats.by_priority[key]} />
                                ))}
                            </div>
                        </section>

                        <Card className="rounded-[16px] p-4 sm:p-5 flex items-center gap-3">
                            <span
                                aria-hidden="true"
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-surface-soft)] text-[var(--color-ink-muted)]"
                            >
                                <SkipForward className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                                <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                                    Most skipped
                                </h3>
                                {stats.most_skipped ? (
                                    <p className="mt-1 font-inter text-[15px] text-[var(--color-ink)] break-words">
                                        {stats.most_skipped.label}{' '}
                                        <span className="text-[var(--color-ink-muted)]">
                                            — skipped {stats.most_skipped.skips}{' '}
                                            {stats.most_skipped.skips === 1 ? 'time' : 'times'}
                                        </span>
                                    </p>
                                ) : (
                                    <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">Nothing skipped this week.</p>
                                )}
                            </div>
                        </Card>
                    </div>
                )
            )}
        </div>
    );
};
