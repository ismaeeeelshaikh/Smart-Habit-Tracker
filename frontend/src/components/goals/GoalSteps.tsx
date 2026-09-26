import React, { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { breakDownGoal } from '../../api';
import type { Goal, GoalStep } from '../../types';
import { Button } from '../ui/Button';

const MAX_STEPS = 30;

const inputClass =
    'h-9 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]';

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
            <div className="flex flex-col gap-2 border-t border-border pt-3">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-sm text-muted-foreground">
                    Break it into steps and each suggestion will say what to do today.
                </p>
                <Button variant="secondary" className="text-sm px-3 py-1.5 h-auto" onClick={() => setDraft([])}>
                    Break it down
                </Button>
            </div>
        );
    }

    // --- the saved list ---------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="inline-flex items-center gap-2 text-sm text-left rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
                >
                    <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 transition-transform motion-reduce:transition-none ${isOpen ? '' : '-rotate-90'}`}
                    />
                    <span className="font-medium tabular-nums">
                        Steps {doneCount}/{steps.length}
                    </span>
                    <span className="text-muted-foreground min-w-0 break-words">
                        {today ? `· Today: ${today}` : '· All done'}
                    </span>
                </button>
                <Button
                    variant="secondary"
                    className="text-sm px-3 py-1.5 h-auto"
                    onClick={() => setDraft(steps.map((s) => s.title))}
                >
                    Edit steps
                </Button>
            </div>

            <ul id={panelId} hidden={!isOpen} className="flex flex-col gap-1.5 pl-6">
                {steps.map((step, index) => (
                    <li key={`${index}-${step.title}`}>
                        <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={step.done}
                                disabled={isBusy}
                                onChange={() => toggle(index)}
                                className="mt-0.5 h-4 w-4 rounded border-input"
                            />
                            <span className={`min-w-0 break-words ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                                {step.title}
                            </span>
                        </label>
                    </li>
                ))}
            </ul>

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}
        </div>
    );
};
