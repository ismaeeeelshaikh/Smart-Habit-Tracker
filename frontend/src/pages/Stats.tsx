import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
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

const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const isoWeekStart = (d = new Date()) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return copy.toISOString().slice(0, 10);
};

const PriorityStat = ({
    label,
    color,
    tally,
}: {
    label: string;
    color: string;
    tally: CompletionTally;
}) => (
    <Card className="p-6 space-y-3">
        <div className="flex items-baseline justify-between">
            <h3 className="font-inter font-medium text-[15px]">{label}</h3>
            <span className="font-display font-semibold text-[24px]">
                {tally.completion_rate}%
            </span>
        </div>

        {/* Plain progress bar — the Design Brief asks for a simple visual, not a chart library. */}
        <div
            className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden"
            role="img"
            aria-label={`${label} priority: ${tally.completion_rate}% completed, ${tally.completed} of ${tally.total}`}
        >
            <div
                className="h-full rounded-full transition-all"
                style={{ width: `${tally.completion_rate}%`, backgroundColor: color }}
            />
        </div>

        <p className="text-[13px] text-[var(--color-ink-muted)]">
            {tally.completed} of {tally.total} completed
        </p>
    </Card>
);

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
        <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
            <header>
                <h1 className="font-display font-semibold text-[24px]">Stats</h1>
                <p className="text-[var(--color-ink-muted)]">Weekly completion statistics.</p>
            </header>

            <div className="flex items-center justify-between">
                <button
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                    className="px-3 py-2 rounded-[8px] text-[15px] font-inter hover:bg-[var(--color-free-tint)] transition-colors"
                >
                    ← Previous
                </button>

                <span className="font-inter text-[15px] font-medium">
                    {stats
                        ? `${shortDate(stats.week_start)} – ${shortDate(stats.week_end)}`
                        : shortDate(weekStart)}
                </span>

                <button
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                    disabled={isCurrentWeek}
                    className="px-3 py-2 rounded-[8px] text-[15px] font-inter hover:bg-[var(--color-free-tint)] transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                >
                    Next →
                </button>
            </div>

            {error ? (
                <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
                    <p>Couldn't load stats for this week.</p>
                    <button
                        onClick={load}
                        className="font-medium text-[var(--color-free)] hover:brightness-90 transition-all"
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
                <Card className="p-8">
                    <p className="text-center text-[13px] text-[var(--color-ink-muted)]">
                        No activity recorded for this week.
                    </p>
                </Card>
            ) : (
                stats && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {PRIORITIES.map(({ key, label, color }) => (
                                <PriorityStat
                                    key={key}
                                    label={label}
                                    color={color}
                                    tally={stats.by_priority[key]}
                                />
                            ))}
                        </div>

                        <Card className="p-6 space-y-1">
                            <h3 className="font-inter font-medium text-[15px]">Most skipped</h3>
                            {stats.most_skipped ? (
                                <p className="text-[15px] font-inter">
                                    {stats.most_skipped.label}{' '}
                                    <span className="text-[var(--color-ink-muted)]">
                                        — skipped {stats.most_skipped.skips}{' '}
                                        {stats.most_skipped.skips === 1 ? 'time' : 'times'}
                                    </span>
                                </p>
                            ) : (
                                <p className="text-[13px] text-[var(--color-ink-muted)]">
                                    Nothing skipped this week.
                                </p>
                            )}
                        </Card>
                    </div>
                )
            )}
        </div>
    );
};
