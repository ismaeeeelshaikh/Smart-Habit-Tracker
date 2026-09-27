import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { TimelineSegment } from '../TodayTimeline';
import type { NextSuggestion } from '../../types';
import { actOnSuggestion } from '../../utils/suggestions';
import type { SuggestionAction } from '../../utils/suggestions';
import { formatTime as clock, formatDuration, formatDurationShort, minutesToClock } from '../../utils/time';

interface FreeNowHeroProps {
  /** Today's committed and free segments; null while loading. */
  segments: TimelineSegment[] | null;
  nowMinutes: number;
  todayIso: string;
  next: NextSuggestion | null;
  nextError: boolean;
  onRetryNext: () => void;
  /** Called after Done / Later / Skip is saved, with a line to confirm it. */
  onAnswered: (message: string) => void;
  onError: (message: string) => void;
}

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const DAY_LABEL = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
} as const;

// Same words the Telegram bot uses (App Flow Document 12.1).
const CONFIRM: Record<SuggestionAction, (goal: string) => string> = {
  done: (goal) => `✅ ${goal} marked as done — nice work!`,
  later: (goal) => `⏳ ${goal} snoozed — it comes back in your next free slot.`,
  skipped: (goal) => `${goal} skipped for today. No worries — see you tomorrow.`,
};

const heroButton =
  'min-h-[46px] rounded-full font-inter text-[15px] font-semibold transition-[transform,background-color] active:scale-[0.97] touch-manipulation disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-hero-to)]';

/**
 * The top of the Dashboard: how much free time there is right now (or when the
 * next stretch starts), and the one task suggested for it, answerable in place.
 */
export const FreeNowHero = ({
  segments,
  nowMinutes,
  todayIso,
  next,
  nextError,
  onRetryNext,
  onAnswered,
  onError,
}: FreeNowHeroProps) => {
  const [busy, setBusy] = useState<SuggestionAction | null>(null);

  const ordered = segments ? [...segments].sort((a, b) => a.start - b.start) : [];
  const current = ordered.find(
    (s) => s.kind === 'free' && s.start <= nowMinutes && nowMinutes < s.end,
  );
  const upcoming = ordered.find((s) => s.kind === 'free' && s.start > nowMinutes);
  const after = current
    ? ordered.find((s) => s.kind === 'committed' && s.start >= current.end)
    : undefined;

  const allocation = next?.allocations[0];
  const slotIsToday = next?.slot?.date === todayIso;

  const answer = async (action: SuggestionAction) => {
    if (!allocation || !next?.slot) return;
    setBusy(action);
    try {
      await actOnSuggestion(allocation, next.slot, action);
      onAnswered(CONFIRM[action](allocation.goal_name));
    } catch {
      onError("⚠️ Couldn't save that — please try again.");
    } finally {
      setBusy(null);
    }
  };

  let eyebrow = 'Today';
  let big: string | null = null;
  let line: ReactNode = 'No more free time today.';
  if (!segments) {
    line = 'Loading your day…';
  } else if (current) {
    eyebrow = 'Free right now';
    big = formatDurationShort(current.end - nowMinutes);
    line = (
      <>
        until <span className="font-mono font-medium">{minutesToClock(current.end)}</span>
        {after?.label ? ` · then ${after.label}` : ''}
      </>
    );
  } else if (upcoming) {
    eyebrow = 'Next free slot';
    big = `in ${formatDurationShort(upcoming.start - nowMinutes)}`;
    line = (
      <span className="font-mono">
        {minutesToClock(upcoming.start)} – {minutesToClock(upcoming.end)} ·{' '}
        {formatDuration(upcoming.end - upcoming.start)}
      </span>
    );
  }

  const elapsed = current
    ? Math.round(((nowMinutes - current.start) / (current.end - current.start)) * 100)
    : null;

  return (
    <section aria-labelledby="hero-eyebrow" className="hero-surface rounded-[24px] p-5 sm:p-6 grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="hero-eyebrow"
          className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em]"
        >
          {current && (
            <span aria-hidden="true" className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#9FE3B8] opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9FE3B8]" />
            </span>
          )}
          {eyebrow}
        </h2>
        {current && (
          <span className="font-mono text-[12px] text-white/75">
            {minutesToClock(current.start)} – {minutesToClock(current.end)}
          </span>
        )}
      </div>

      {big && (
        <p className="font-mono font-semibold text-[48px] sm:text-[56px] leading-none tracking-[-0.03em] tabular-nums">
          {big}
        </p>
      )}
      <p className="text-[14px] text-white/80 font-inter -mt-1">{line}</p>

      <div className="border-t border-white/20 pt-3 grid gap-3">
        {nextError ? (
          <div className="text-[14px] text-white/85 font-inter flex items-center gap-3">
            Couldn't load your schedule right now.
            <button type="button" onClick={onRetryNext} className="underline underline-offset-2 font-medium min-h-[44px]">
              Retry
            </button>
          </div>
        ) : !next ? (
          <div role="status" aria-label="Loading" className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        ) : !allocation || !next.slot ? (
          <p className="text-[14px] text-white/85 font-inter">
            {next.reason ?? 'Nothing to suggest right now.'}{' '}
            <Link to="/goals" className="underline underline-offset-2 font-medium">
              Manage goals
            </Link>
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 rounded-full bg-white/90 px-2 py-1 font-inter text-[11px] font-semibold leading-none text-[var(--color-hero-to)]">
                {PRIORITY_LABEL[allocation.priority]}
              </span>
              <span className="flex-1 min-w-0 truncate font-inter text-[15px] font-medium">
                {allocation.goal_name}
                {allocation.current_step && (
                  <span className="font-normal text-white/75"> — today: {allocation.current_step}</span>
                )}
              </span>
              <span className="font-mono text-[12px] text-white/80 whitespace-nowrap">
                {/* A suggestion for a later day says which day. */}
                {!slotIsToday && `${DAY_LABEL[next.slot.day_of_week]} · `}
                {clock(allocation.start)} · {formatDuration(allocation.minutes)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => answer('done')}
                disabled={busy !== null}
                className={`${heroButton} flex-1 inline-flex items-center justify-center gap-1.5 bg-white text-[var(--color-hero-to)]`}
              >
                <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                {busy === 'done' ? 'Saving…' : 'Done'}
              </button>
              <button
                type="button"
                onClick={() => answer('later')}
                disabled={busy !== null}
                className={`${heroButton} px-4 bg-white/15 hover:bg-white/25`}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => answer('skipped')}
                disabled={busy !== null}
                className={`${heroButton} px-4 bg-white/15 hover:bg-white/25`}
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>

      {elapsed !== null && current && (
        <div aria-hidden="true" className="grid gap-1.5">
          <div className="h-1 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-white" style={{ width: `${elapsed}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-white/70">
            <span>{minutesToClock(current.start)}</span>
            <span>{elapsed}% gone</span>
            <span>{minutesToClock(current.end)}</span>
          </div>
        </div>
      )}
    </section>
  );
};
