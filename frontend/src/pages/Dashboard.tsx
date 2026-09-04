import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { WeekStrip } from '../components/WeekStrip';
import type { DaySchedule, TimeBlock } from '../components/WeekStrip';
import { useAuth } from '../contexts/AuthContext';
import { getNextSuggestion, getScheduleBlocks, getTodaysFreeSlots, getWeeklyStats } from '../api';
import type {
  DayOfWeek,
  NextSuggestion,
  ScheduleBlock,
  TodayFreeSlots,
  WeeklyStats,
} from '../types';

const DAYS: { id: DayOfWeek; name: string }[] = [
  { id: 'mon', name: 'MON' },
  { id: 'tue', name: 'TUE' },
  { id: 'wed', name: 'WED' },
  { id: 'thu', name: 'THU' },
  { id: 'fri', name: 'FRI' },
  { id: 'sat', name: 'SAT' },
  { id: 'sun', name: 'SUN' },
];

const toMinutes = (hhmmss: string) => {
  const [h, m] = hhmmss.split(':').map(Number);
  return h * 60 + m;
};

/** "17:00:00" -> "17:00"; also accepts a full ISO datetime. */
const clock = (value: string) => {
  const timePart = value.includes('T') ? value.split('T')[1] : value;
  return timePart.slice(0, 5);
};

const buildWeekStrip = (blocks: ScheduleBlock[]): DaySchedule[] =>
  DAYS.map((day) => {
    const forDay = blocks.filter((b) => b.day_of_week === day.id);

    // A loosely-committed day ("Sunday: Family") blocks everything, so show it
    // as one full-height band rather than an empty — and misleading — column.
    const busyAllDay = forDay.find(
      (b) => b.is_flexible_block && b.flexible_availability === 'busy',
    );
    if (busyAllDay) {
      return {
        dayName: day.name,
        blocks: [
          {
            id: busyAllDay.id,
            type: 'committed' as const,
            label: busyAllDay.label,
            startMinutes: 0,
            endMinutes: 24 * 60,
          },
        ],
      };
    }

    const timeBlocks: TimeBlock[] = forDay
      .filter((b) => !b.is_flexible_block && b.start_time && b.end_time)
      .map((b) => ({
        id: b.id,
        type: 'committed',
        label: b.label,
        startMinutes: toMinutes(b.start_time!),
        endMinutes: toMinutes(b.end_time!),
      }));

    return { dayName: day.name, blocks: timeBlocks };
  });

const CardError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="text-[13px] text-[var(--color-ink-muted)] space-y-2">
    <p>{message}</p>
    <button
      onClick={onRetry}
      className="font-medium text-[var(--color-free)] hover:brightness-90 transition-all"
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

export const Dashboard = () => {
  const { user } = useAuth();

  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [scheduleError, setScheduleError] = useState(false);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);

  const [today, setToday] = useState<TodayFreeSlots | null>(null);
  const [todayError, setTodayError] = useState(false);

  const [next, setNext] = useState<NextSuggestion | null>(null);
  const [nextError, setNextError] = useState(false);

  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  const loadSchedule = useCallback(async () => {
    setIsScheduleLoading(true);
    setScheduleError(false);
    try {
      setSchedule(buildWeekStrip(await getScheduleBlocks()));
    } catch {
      setScheduleError(true);
    } finally {
      setIsScheduleLoading(false);
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
    loadSchedule();
    loadToday();
    loadNext();
    loadStats();
  }, [loadSchedule, loadToday, loadNext, loadStats]);

  const greetingName = user?.email?.split('@')[0] ?? '';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-display font-semibold text-[var(--color-ink)] text-2xl">
            Hi{greetingName ? `, ${greetingName}` : ''} 👋
          </h1>
          <p className="text-[var(--color-ink-muted)] font-inter mt-1">
            Here is your time intelligence for today.
          </p>
        </div>
      </header>

      {user && !user.telegram_linked && (
        <div className="bg-[var(--color-warning-bg)] p-4 rounded-[10px] text-[15px] font-inter text-[var(--color-ink)]">
          You haven't connected Telegram yet — reminders won't be delivered.{' '}
          <Link
            to="/settings"
            className="font-medium underline hover:text-[var(--color-free)]"
          >
            Connect now
          </Link>
        </div>
      )}

      <section>
        <h2 className="font-display font-semibold text-[18px] mb-4">Your Week</h2>
        {isScheduleLoading ? (
          <div className="h-[200px] flex items-center justify-center border border-[var(--color-border)] rounded-md">
            <Spinner />
          </div>
        ) : scheduleError ? (
          <Card className="p-6">
            <CardError message="Couldn't load your schedule right now." onRetry={loadSchedule} />
          </Card>
        ) : (
          <WeekStrip schedule={schedule} size="compact" />
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display font-semibold text-[18px] mb-4">Today's Free Slots</h3>
          {todayError ? (
            <CardError message="Couldn't load your schedule right now." onRetry={loadToday} />
          ) : !today ? (
            <Spinner />
          ) : today.slots.length === 0 ? (
            <p className="text-[var(--color-ink-muted)] text-[13px]">
              No free time today — enjoy your full schedule!
            </p>
          ) : (
            <ul className="space-y-2">
              {today.slots.map((slot) => (
                <li
                  key={slot.start}
                  className="flex items-baseline justify-between text-[15px] font-inter"
                >
                  <span className="font-mono">
                    {clock(slot.start)} – {clock(slot.end)}
                  </span>
                  <span className="text-[13px] text-[var(--color-ink-muted)]">
                    {slot.duration_minutes} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-display font-semibold text-[18px] mb-4">Next Suggested Task</h3>
          {nextError ? (
            <CardError message="Couldn't load your schedule right now." onRetry={loadNext} />
          ) : !next ? (
            <Spinner />
          ) : next.allocations.length === 0 ? (
            <div className="text-[var(--color-ink-muted)] text-[13px] space-y-2">
              <p>{next.reason ?? 'Nothing to suggest right now.'}</p>
              <Link
                to="/goals"
                className="font-medium text-[var(--color-free)] hover:brightness-90"
              >
                Manage goals
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {next.slot && (
                <p className="text-[13px] text-[var(--color-ink-muted)] font-inter">
                  {clock(next.slot.start)} – {clock(next.slot.end)} ·{' '}
                  {next.slot.duration_minutes} min free
                </p>
              )}
              <ul className="space-y-2">
                {next.allocations.map((a) => (
                  <li key={a.goal_id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[15px] font-inter">
                      <Badge priority={a.priority} />
                      {a.goal_name}
                    </span>
                    <span className="text-[13px] text-[var(--color-ink-muted)] font-mono whitespace-nowrap">
                      {clock(a.start)} · {a.minutes} min
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-display font-semibold text-[18px] mb-4">This Week at a Glance</h3>
        {statsError ? (
          <CardError message="Stats unavailable." onRetry={loadStats} />
        ) : !stats ? (
          <Spinner />
        ) : stats.total_actions === 0 ? (
          <p className="text-[var(--color-ink-muted)] text-[13px]">
            No activity recorded yet this week.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-display font-semibold text-[24px]">
                {stats.overall.completion_rate}%
              </span>
              <span className="text-[13px] text-[var(--color-ink-muted)]">
                completed ({stats.overall.completed} of {stats.overall.total})
              </span>
            </div>
            {/* A small bar, not a chart — per App Flow Document Section 5. */}
            <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-free)] transition-all"
                style={{ width: `${stats.overall.completion_rate}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      <nav className="flex flex-wrap gap-4 text-[15px] font-inter">
        <Link to="/schedule" className="text-[var(--color-free)] hover:brightness-90 font-medium">
          View Schedule
        </Link>
        <Link to="/goals" className="text-[var(--color-free)] hover:brightness-90 font-medium">
          View Goals
        </Link>
        <Link to="/stats" className="text-[var(--color-free)] hover:brightness-90 font-medium">
          View Full Stats
        </Link>
      </nav>
    </div>
  );
};
