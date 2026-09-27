import { cn } from '../../utils/cn';
import type { DayTally } from '../../types';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * One bar per day of the week, Monday first. A day with nothing answered shows
 * an empty track, not a zero-height stub that reads as "you failed".
 */
export const WeekBars = ({ days, todayIso }: { days: DayTally[]; todayIso: string }) => (
  <ul className="grid grid-cols-7 items-end gap-2" aria-label="Completed by day">
    {days.map((d, i) => {
      const isToday = d.date === todayIso;
      return (
        <li
          key={d.date}
          className="grid justify-items-center gap-1.5"
          aria-label={
            d.total === 0
              ? `${NAMES[i]}: nothing yet`
              : `${NAMES[i]}: ${d.completed} of ${d.total} done`
          }
        >
          <span className="relative block h-16 w-full max-w-[18px] overflow-hidden rounded-[6px] bg-[var(--color-border)]">
            <span
              className="absolute inset-x-0 bottom-0 rounded-[6px] bg-[var(--color-free)] transition-[height] duration-500"
              style={{ height: `${d.completion_rate}%` }}
            />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'grid h-[18px] w-[18px] place-items-center rounded-full font-mono text-[11px] leading-none',
              isToday ? 'bg-[var(--color-ink)] text-[var(--color-bg)]' : 'text-[var(--color-ink-muted)]',
            )}
          >
            {LETTERS[i]}
          </span>
        </li>
      );
    })}
  </ul>
);
