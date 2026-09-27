import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { TimelineSegment } from '../TodayTimeline';
import type { NextSuggestion, Reminder } from '../../types';
import { actOnSuggestion } from '../../utils/suggestions';
import type { SuggestionAction } from '../../utils/suggestions';
import {
  formatTime as clock,
  formatDuration,
  formatDurationShort,
  minutesToClock,
  toMinutes,
} from '../../utils/time';

/**
 * How early a task can be answered. Matches the dispatcher's LOOKAHEAD: Telegram
 * sends the message (with its buttons) up to 15 minutes before the slot starts.
 */
const ANSWER_LEAD_MINUTES = 15;

interface FreeNowHeroProps {
  /** Today's committed and free segments; null while loading. */
  segments: TimelineSegment[] | null;
  nowMinutes: number;
  todayIso: string;
  next: NextSuggestion | null;
  nextError: boolean;
  onRetryNext: () => void;
  /** Today's suggestion reminders already answered (done, later, skipped). */
  answeredToday: Reminder[];
  /**
   * Called after Done / Later / Skip is saved, with a line to confirm it.
   * Resolves once the next suggestion has been fetched.
   */
  onAnswered: (message: string) => Promise<unknown>;
  onError: (message: string) => void;
}

const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const DAY_LABEL = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
} as const;

/** "2026-09-27" -> "2026-09-28". */
const nextIsoDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** What an answer means, said the same way in the toast and on the card. */
const STATUS: Record<SuggestionAction, (goal: string) => string> = {
  done: (goal) => `✅ ${goal} done — counted in this week's stats.`,
  later: (goal) => `⏳ ${goal} snoozed — a reminder will be sent in your next free slot.`,
  skipped: (goal) => `${goal} skipped for today — it'll be back tomorrow.`,
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
  answeredToday,
  onAnswered,
  onError,
}: FreeNowHeroProps) => {
  const [busy, setBusy] = useState<SuggestionAction | null>(null);
  // Answers from this visit, so the card changes the moment one is saved rather
  // than when the refreshed list arrives from the server.
  const [answeredHere, setAnsweredHere] = useState<Reminder[]>([]);

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
  // "Tomorrow" rather than a bare weekday, which read like a label for today.
  const dayWord = !next?.slot || slotIsToday
    ? ''
    : next.slot.date === nextIsoDay(todayIso)
      ? 'Tomorrow'
      : DAY_LABEL[next.slot.day_of_week];
  // Only a task whose time has come can be answered — the same moment Telegram
  // would offer the buttons. A plan for tonight or tomorrow is shown, not marked.
  const startsIn =
    allocation && slotIsToday ? toMinutes(allocation.start.split('T')[1] ?? allocation.start) - nowMinutes : null;
  const canAnswer = startsIn !== null && startsIn <= ANSWER_LEAD_MINUTES;

  // The latest answer today for this goal. Done and Skip settle it for the day;
  // Later only until the snoozed reminder is due again.
  const lastAnswer = allocation
    ? [
        ...answeredToday,
        // The server's copy wins once it has caught up.
        ...answeredHere.filter((r) => !answeredToday.some((t) => t.id === r.id)),
      ]
        .filter((r) => r.goal_id === allocation.goal_id)
        .at(-1)
    : undefined;
  const status =
    lastAnswer &&
    lastAnswer.status !== 'pending' &&
    (lastAnswer.status !== 'later' || new Date(lastAnswer.scheduled_time).getTime() > Date.now())
      ? STATUS[lastAnswer.status](allocation!.goal_name)
      : null;

  const answer = async (action: SuggestionAction) => {
    if (!allocation || !next?.slot || busy) return;
    setBusy(action);
    let saved: Reminder;
    try {
      saved = await actOnSuggestion(allocation, next.slot, action);
    } catch {
      onError("⚠️ Couldn't save that — please try again.");
      setBusy(null);
      return;
    }
    const message = STATUS[action](allocation.goal_name);
    setAnsweredHere((prev) => [...prev, saved]);
    // Stay locked until the refreshed suggestion is on screen.
    try {
      await onAnswered(message);
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
                {dayWord && `${dayWord} · `}
                {clock(allocation.start)} · {formatDuration(allocation.minutes)}
              </span>
            </div>
            {status ? (
              <p role="status" className="rounded-[12px] bg-white/15 px-3 py-2.5 font-inter text-[14px] font-medium">
                {status}
              </p>
            ) : !canAnswer ? (
              <p className="font-inter text-[13px] text-white/80">
                {`Coming up ${dayWord === 'Tomorrow' ? 'tomorrow ' : dayWord ? `${dayWord} ` : ''}at ${clock(allocation.start)}.`}
              </p>
            ) : (
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
            )}
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
