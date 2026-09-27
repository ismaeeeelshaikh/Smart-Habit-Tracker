import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import { TodayTimeline } from '../components/TodayTimeline';
import type { TimelineSegment } from '../components/TodayTimeline';
import { FreeNowHero } from '../components/dashboard/FreeNowHero';
import { UpNext } from '../components/dashboard/UpNext';
import { WeekBars } from '../components/dashboard/WeekBars';
import { useAuth } from '../contexts/AuthContext';
import { useNow } from '../hooks/useNow';
import {
  getNextSuggestion,
  getScheduleBlocks,
  getTodaysFreeSlots,
  getWeekFreeSlots,
  getWeeklyStats,
} from '../api';
import { cn } from '../utils/cn';
import { formatTime as clock, formatDuration, toMinutes } from '../utils/time';
import type {
  DayOfWeek,
  NextSuggestion,
  ScheduleBlock,
  TodayFreeSlots,
  WeekFreeSlots,
  WeeklyStats,
} from '../types';

interface TodayPlan {
  segments: TimelineSegment[];
  windowStart: number;
  windowEnd: number;
  freeMinutes: number;
}

/**
 * Today's committed blocks next to today's free slots. The free slots come
 * from the backend's weekly pattern rather than being worked out here, so the
 * timeline can never disagree with what the scheduler will act on.
 */
const buildToday = (
  blocks: ScheduleBlock[],
  week: WeekFreeSlots,
  day: DayOfWeek,
): TodayPlan => {
  const windowStart = toMinutes(week.day_start_time);
  const windowEnd = toMinutes(week.day_end_time);
  const forDay = blocks.filter((b) => b.day_of_week === day);

  // A loosely-committed day ("Sunday: Family") blocks everything, so show it
  // as one full band rather than an empty — and misleading — line.
  const busyAllDay = forDay.find(
    (b) => b.is_flexible_block && b.flexible_availability === 'busy',
  );
  if (busyAllDay) {
    return {
      segments: [
        {
          id: busyAllDay.id,
          kind: 'committed',
          label: busyAllDay.label,
          start: windowStart,
          end: windowEnd,
        },
      ],
      windowStart,
      windowEnd,
      freeMinutes: 0,
    };
  }

  const committed: TimelineSegment[] = forDay
    .filter((b) => !b.is_flexible_block && b.start_time && b.end_time)
    .map((b) => ({
      id: b.id,
      kind: 'committed',
      label: b.label,
      start: toMinutes(b.start_time!),
      end: toMinutes(b.end_time!),
    }));

  const freeSlots = week.slots_by_day[day] ?? [];
  const free: TimelineSegment[] = freeSlots.map((s) => ({
    id: `free-${s.start_time}`,
    kind: 'free',
    start: toMinutes(s.start_time),
    end: toMinutes(s.end_time),
  }));

  return {
    segments: [...free, ...committed],
    windowStart,
    windowEnd,
    freeMinutes: freeSlots.reduce((sum, s) => sum + s.duration_minutes, 0),
  };
};

const CardError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
    <p>{message}</p>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-[44px] font-medium text-[var(--color-free)] hover:brightness-90 transition-[filter] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] rounded-[8px]"
    >
      Retry
    </button>
  </div>
);

const Spinner = () => (
  <div
    role="status"
    aria-label="Loading"
    className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--color-free)]"
  />
);

const cardTitle = 'font-display font-semibold text-[18px] leading-[26px] text-[var(--color-ink)]';
const card = 'p-4 sm:p-6 rounded-[16px]';
const linkStyle =
  'inline-flex items-center gap-1 min-h-[44px] font-inter text-[15px] font-medium text-[var(--color-free)] hover:brightness-90 transition-[filter] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] rounded-[8px]';

const greeting = (minutes: number) =>
  minutes < 12 * 60 ? 'Good morning' : minutes < 17 * 60 ? 'Good afternoon' : 'Good evening';

export const Dashboard = () => {
  const { user } = useAuth();
  const now = useNow(user?.timezone ?? 'UTC');

  const [planError, setPlanError] = useState(false);
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [week, setWeek] = useState<WeekFreeSlots | null>(null);

  const [today, setToday] = useState<TodayFreeSlots | null>(null);
  const [todayError, setTodayError] = useState(false);

  const [next, setNext] = useState<NextSuggestion | null>(null);
  const [nextError, setNextError] = useState(false);

  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const loadPlan = useCallback(async () => {
    setPlanError(false);
    try {
      // Independent, so fetched side by side rather than one after the other.
      const [b, w] = await Promise.all([getScheduleBlocks(), getWeekFreeSlots()]);
      setBlocks(b);
      setWeek(w);
    } catch {
      setPlanError(true);
    }
  }, []);

  const loadToday = useCallback(async () => {
    setTodayError(false);
    try {
      setToday(await getTodaysFreeSlots());
    } catch {
      setTodayError(true);
    }
  }, []);

  const loadNext = useCallback(async () => {
    setNextError(false);
    try {
      setNext(await getNextSuggestion());
    } catch {
      setNextError(true);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsError(false);
    try {
      setStats(await getWeeklyStats());
    } catch {
      setStatsError(true);
    }
  }, []);

  useEffect(() => {
    loadPlan();
    loadToday();
    loadNext();
    loadStats();
  }, [loadPlan, loadToday, loadNext, loadStats]);

  // Derived, not stored: rebuilt when the weekday rolls over at midnight,
  // not on every minute tick.
  const plan = useMemo(
    () => (blocks && week ? buildToday(blocks, week, now.weekday) : null),
    [blocks, week, now.weekday],
  );

  // After Done / Later / Skip the suggestion moves on and the week's numbers
  // change, so both are fetched again.
  const handleAnswered = useCallback(
    (message: string) => {
      setToast({ message, type: 'success' });
      loadNext();
      loadStats();
    },
    [loadNext, loadStats],
  );
  const handleActionError = useCallback(
    (message: string) => setToast({ message, type: 'error' }),
    [],
  );

  const greetingName = user?.email?.split('@')[0] ?? '';
  const isQuietDay = user?.quiet_days?.includes(now.weekday) ?? false;

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <header>
        <h1 className="font-display font-semibold text-[var(--color-ink)] text-[26px] leading-[32px] sm:text-[28px] break-words text-balance">
          {greeting(now.minutes)}
          {greetingName ? `, ${greetingName}` : ''}
        </h1>
        <p className="text-[13px] leading-[18px] text-[var(--color-ink-muted)] font-inter mt-1">
          {now.dateLabel}
        </p>
      </header>

      {user && !user.telegram_linked && (
        <div className="bg-[var(--color-warning-bg)] px-4 py-3 rounded-[12px] text-[15px] leading-[22px] font-inter text-[var(--color-ink)]">
          You haven't connected Telegram yet — reminders won't be delivered.{' '}
          <Link
            to="/settings"
            className="font-medium underline underline-offset-2 hover:text-[var(--color-free)]"
          >
            Connect now
          </Link>
        </div>
      )}

      <FreeNowHero
        segments={plan?.segments ?? null}
        nowMinutes={now.minutes}
        todayIso={now.isoDate}
        next={next}
        nextError={nextError}
        onRetryNext={loadNext}
        onAnswered={handleAnswered}
        onError={handleActionError}
      />

      <Card className={card}>
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="font-display font-semibold text-[12px] uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
            Today
          </h2>
          {plan && (
            <p className="text-[13px] text-[var(--color-ink-muted)] font-inter">
              <span className="font-mono font-medium text-[var(--color-free)]">
                {formatDuration(plan.freeMinutes)}
              </span>{' '}
              free today
            </p>
          )}
        </div>
        {isQuietDay && (
          <p className="text-[13px] text-[var(--color-ink-muted)] font-inter mb-2">
            Quiet day — no suggestions today.
          </p>
        )}
        {planError ? (
          <CardError message="Couldn't load your schedule right now." onRetry={loadPlan} />
        ) : !plan ? (
          <div className="h-[120px] flex items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <TodayTimeline
            segments={plan.segments}
            windowStart={plan.windowStart}
            windowEnd={plan.windowEnd}
            nowMinutes={now.minutes}
          />
        )}

        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <h3 className="font-display font-semibold text-[15px] text-[var(--color-ink)] mb-2">
            Today's free slots
          </h3>
          {todayError ? (
            <CardError message="Couldn't load your schedule right now." onRetry={loadToday} />
          ) : !today ? (
            <Spinner />
          ) : today.slots.length === 0 ? (
            <p className="text-[var(--color-ink-muted)] text-[13px]">
              No free time today — enjoy your full schedule!
            </p>
          ) : (
            <ul className="space-y-1">
              {today.slots.map((slot, i) => {
                // The list is what's left of today, so the first row is either
                // the slot you're in now or the one coming up next.
                const startsAt = toMinutes(slot.start.split('T')[1] ?? slot.start);
                const tag = i === 0 ? (startsAt <= now.minutes ? 'Now' : 'Next') : null;
                return (
                  <li
                    key={slot.start}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] text-[14px] font-mono text-[var(--color-ink)]',
                      tag && 'bg-[var(--color-free-tint)] border-l-[3px] border-[var(--color-free)] font-medium',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {clock(slot.start)} – {clock(slot.end)}
                      {tag && (
                        <span className="px-1.5 py-0.5 rounded-[4px] border border-[var(--color-free)] text-[10px] uppercase tracking-wider text-[var(--color-free)]">
                          {tag}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'text-[13px] whitespace-nowrap',
                        tag ? 'text-[var(--color-free)]' : 'text-[var(--color-ink-muted)]',
                      )}
                    >
                      {formatDuration(slot.duration_minutes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        <Card className={card}>
          <section aria-labelledby="up-next-title">
            <h2 id="up-next-title" className={cardTitle}>
              Up next
            </h2>
            <div className="mt-2">
              {nextError ? (
                <CardError message="Couldn't load your schedule right now." onRetry={loadNext} />
              ) : !next ? (
                <Spinner />
              ) : next.allocations.length === 0 ? (
                <div className="text-[var(--color-ink-muted)] text-[13px]">
                  <p>Nothing planned for your next free slot.</p>
                  <Link to="/goals" className={linkStyle}>
                    Manage goals
                  </Link>
                </div>
              ) : (
                <UpNext allocations={next.allocations} />
              )}
            </div>
          </section>
        </Card>

        <Card className={card}>
          <section aria-labelledby="week-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="week-title" className={cardTitle}>
                This week
              </h2>
              <Link to="/stats" className={linkStyle}>
                Full stats <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
            {statsError ? (
              <div className="mt-2">
                <CardError message="Stats unavailable." onRetry={loadStats} />
              </div>
            ) : !stats ? (
              <div className="mt-2">
                <Spinner />
              </div>
            ) : stats.total_actions === 0 ? (
              <p className="mt-2 text-[var(--color-ink-muted)] text-[13px]">
                Not enough data yet — check back after your first few reminders.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-4">
                {/* An older backend sends no by_day; the percentage still stands. */}
                {stats.by_day?.length === 7 ? (
                  <WeekBars days={stats.by_day} todayIso={now.isoDate} />
                ) : (
                  <span />
                )}
                <div className="text-right">
                  <p className="font-mono font-semibold text-[32px] leading-none tracking-[-0.02em] text-[var(--color-ink)]">
                    {stats.overall.completion_rate}%
                  </p>
                  <p className="mt-1 text-[13px] text-[var(--color-ink-muted)] font-inter">
                    <span className="font-mono">
                      {stats.overall.completed} of {stats.overall.total}
                    </span>{' '}
                    done
                  </p>
                </div>
              </div>
            )}
          </section>
        </Card>
      </div>

      <nav aria-label="Quick links" className="flex flex-wrap gap-x-6">
        <Link to="/schedule" className={linkStyle}>
          View schedule
        </Link>
        <Link to="/goals" className={linkStyle}>
          View goals
        </Link>
      </nav>

      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
    </div>
  );
};
