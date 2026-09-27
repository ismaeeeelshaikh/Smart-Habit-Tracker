import React, { useState } from 'react';
import { Check, ChevronDown, ListChecks, X } from 'lucide-react';
import { breakDownGoal } from '../../api';
import type { Goal, GoalStep } from '../../types';
import { Button } from '../ui/Button';

const MAX_STEPS = 30;

const inputClass =
    'h-10 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]';

interface GoalStepsProps {
    goal: Goal;
    /** Saves the whole list — the ordinary goal update. */
    onSave: (steps: GoalStep[]) => Promise<unknown>;
}

/**
 * A big goal as steps a session can finish. The first unticked step is
 * "today's", and it is named in the Telegram suggestion ("DSA — today:
 * Strings"). Steps are ticked by hand: finishing a session isn't the same as
 * finishing a step.
 */
export const GoalSteps: React.FC<GoalStepsProps> = ({ goal, onSave }) => {
    const steps = goal.steps ?? [];
    const [isOpen, setIsOpen] = useState(false);
    // A list being written or reviewed before it is saved; null when not editing.
    const [draft, setDraft] = useState<string[] | null>(null);
    const [note, setNote] = useState('');
    const [newStep, setNewStep] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const doneCount = steps.filter((s) => s.done).length;
    const today = steps.find((s) => !s.done)?.title;
    const panelId = `goal-steps-${goal.id}`;

    const run = async (work: () => Promise<void>, fallback: string) => {
        setError(null);
        setIsBusy(true);
        try {
            await work();
        } catch (err) {
            setError(err instanceof Error ? err.message : fallback);
        } finally {
            setIsBusy(false);
        }
    };

    const suggest = () =>
        run(async () => {
            const result = await breakDownGoal(goal.id, note);
            setDraft(result.steps);
        }, "Couldn't break that goal down.");

    const toggle = (index: number) =>
        run(
            () => onSave(steps.map((s, i) => (i === index ? { ...s, done: !s.done } : s))).then(() => undefined),
            "Couldn't save that. Please try again.",
        );

    const saveDraft = () =>
        run(async () => {
            // A step kept from the saved list keeps its tick; a new one starts undone.
            const doneBefore = new Set(steps.filter((s) => s.done).map((s) => s.title.toLowerCase()));
            const cleaned = (draft ?? []).map((t) => t.trim()).filter(Boolean);
            await onSave(cleaned.map((title) => ({ title, done: doneBefore.has(title.toLowerCase()) })));
            setDraft(null);
            setNote('');
            setIsOpen(true);
        }, "Couldn't save those steps.");

    const addToDraft = () => {
        const title = newStep.trim();
        if (!title || !draft || draft.length >= MAX_STEPS) return;
        setDraft([...draft, title.slice(0, 100)]);
        setNewStep('');
    };

    // --- writing or reviewing a list -------------------------------------------------
    if (draft !== null) {
        return (
            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-sm font-medium flex-1 min-w-[12rem]">
                        What do you already know? (optional)
                        <input
                            className={inputClass}
                            name={`goal-note-${goal.id}`}
                            autoComplete="off"
                            value={note}
                            maxLength={300}
                            placeholder="e.g. I know arrays and strings…"
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </label>
                    <Button variant="secondary" onClick={suggest} disabled={isBusy}>
                        {isBusy ? 'Thinking…' : draft.length ? 'Suggest again' : 'Suggest steps'}
                    </Button>
                </div>

                {draft.length > 0 && (
                    <ol className="flex flex-col gap-1.5">
                        {draft.map((title, index) => (
                            <li key={`${index}-${title}`} className="flex items-center gap-2">
                                <span className="w-6 text-right text-sm text-muted-foreground tabular-nums">
                                    {index + 1}.
                                </span>
                                <input
                                    className={`${inputClass} flex-1 min-w-0`}
                                    aria-label={`Step ${index + 1}`}
                                    name={`goal-step-${index}`}
                                    autoComplete="off"
                                    value={title}
                                    maxLength={100}
                                    onChange={(e) =>
                                        setDraft(draft.map((t, i) => (i === index ? e.target.value : t)))
                                    }
                                />
                                <button
                                    type="button"
                                    aria-label={`Remove step ${index + 1}`}
                                    onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                                    className="rounded-md p-1.5 text-muted-foreground hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
                                >
                                    <X aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ol>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        className={`${inputClass} flex-1 min-w-[12rem]`}
                        aria-label="New step"
                        name={`goal-new-step-${goal.id}`}
                        autoComplete="off"
                        value={newStep}
                        maxLength={100}
                        placeholder="Add a step of your own…"
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addToDraft();
                            }
                        }}
                    />
                    <Button variant="secondary" onClick={addToDraft} disabled={!newStep.trim()}>
                        Add step
                    </Button>
                </div>

                {error && <p className="text-sm text-destructive font-medium">{error}</p>}

                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setDraft(null)} disabled={isBusy}>
                        Cancel
                    </Button>
                    <Button onClick={saveDraft} disabled={isBusy}>
                        {draft.length
                            ? `Save ${draft.length} ${draft.length === 1 ? 'step' : 'steps'}`
                            : 'Save (no steps)'}
                    </Button>
                </div>
            </div>
        );
    }

    // --- no steps yet -------------------------------------------------------------------
    if (steps.length === 0) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                <p className="flex-1 min-w-[12rem] text-[13px] text-[var(--color-ink-muted)]">
                    Break it into steps and each suggestion will say what to do today.
                </p>
                <Button
                    variant="secondary"
                    className="text-sm px-3 py-1.5 h-auto gap-1.5"
                    onClick={() => setDraft([])}
                >
                    <ListChecks aria-hidden="true" className="h-4 w-4" />
                    Break it down
                </Button>
            </div>
        );
    }

    // --- the saved list ---------------------------------------------------------------------
    const percent = Math.round((doneCount / steps.length) * 100);
    return (
        <div className="flex flex-col gap-2.5 border-t border-[var(--color-border)] pt-3">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="grid gap-2 rounded-[10px] text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] focus-visible:ring-offset-2"
            >
                <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                        <span
                            className="block h-full rounded-full bg-[var(--color-free)] transition-[width] duration-500"
                            style={{ width: `${percent}%` }}
                        />
                    </span>
                    <span className="font-mono text-[12px] font-medium text-[var(--color-ink-muted)] tabular-nums">
                        Steps {doneCount}/{steps.length}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 text-[var(--color-ink-muted)] transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                    />
                </span>
                <span className="inline-flex max-w-full items-center gap-1.5 justify-self-start rounded-[10px] bg-[var(--color-free-tint)] px-2.5 py-1.5 font-inter text-[13px] text-[var(--color-free)] break-words">
                    {today ? (
                        <>
                            Today: <b className="font-semibold">{today}</b>
                        </>
                    ) : (
                        'All done'
                    )}
                </span>
            </button>

            <ul id={panelId} hidden={!isOpen} className="flex flex-col gap-1">
                {steps.map((step, index) => (
                    <li key={`${index}-${step.title}`}>
                        <label className="flex min-h-[40px] items-center gap-3 rounded-[8px] px-1 text-[14px] cursor-pointer select-none hover:bg-[var(--color-surface-soft)]">
                            <input
                                type="checkbox"
                                checked={step.done}
                                disabled={isBusy}
                                onChange={() => toggle(index)}
                                className="peer sr-only"
                            />
                            <span
                                aria-hidden="true"
                                className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border-[1.5px] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-free)] ${
                                    step.done
                                        ? 'border-[var(--color-free)] bg-[var(--color-free)] text-[var(--color-on-free)]'
                                        : 'border-[var(--color-border)]'
                                }`}
                            >
                                {step.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
                            </span>
                            <span className={`min-w-0 break-words ${step.done ? 'line-through text-[var(--color-ink-muted)]' : 'text-[var(--color-ink)]'}`}>
                                {step.title}
                            </span>
                        </label>
                    </li>
                ))}
            </ul>

            <button
                type="button"
                onClick={() => setDraft(steps.map((s) => s.title))}
                className="justify-self-start min-h-[36px] rounded-[8px] font-inter text-[13px] font-medium text-[var(--color-free)] hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
            >
                Edit steps
            </button>

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </div>
    );
};
