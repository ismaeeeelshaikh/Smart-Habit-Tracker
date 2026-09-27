import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { formatTime as clock, formatDuration } from '../../utils/time';
import type { Allocation } from '../../types';

/**
 * The plan for the next free slot, in order, as a short vertical timeline.
 * The first row is the task the hero is asking about.
 */
export const UpNext = ({ allocations }: { allocations: Allocation[] }) => (
  <ol className="grid">
    {allocations.map((a, i) => (
      <li
        key={a.goal_id}
        className={cn(
          'relative grid grid-cols-[18px_1fr_auto] items-start gap-3 py-2',
          // The line joining one row's dot to the next.
          i < allocations.length - 1 &&
            "after:absolute after:left-[8px] after:top-[28px] after:-bottom-2 after:w-px after:bg-[var(--color-border)] after:content-['']",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-[3px] ml-[1px] h-3.5 w-3.5 rounded-full border-2',
            i === 0
              ? 'border-[var(--color-free)] bg-[var(--color-free)] shadow-[0_0_0_4px_var(--color-free-tint)]'
              : 'border-[var(--color-border)] bg-[var(--color-surface)]',
          )}
        />
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-medium text-[var(--color-ink)]">{clock(a.start)}</p>
          <p className="mt-1 flex items-center gap-2 min-w-0 font-inter text-[15px] text-[var(--color-ink)]">
            <Badge priority={a.priority} className="shrink-0" />
            <span className="truncate">
              {a.goal_name}
              {a.current_step && (
                <span className="text-[var(--color-ink-muted)]"> — today: {a.current_step}</span>
              )}
            </span>
          </p>
        </div>
        <span className="pt-0.5 font-mono text-[13px] text-[var(--color-ink-muted)] whitespace-nowrap">
          {formatDuration(a.minutes)}
        </span>
      </li>
    ))}
  </ol>
);
