import React, { useState } from 'react';
import { Clock, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { InlineConfirm } from '../ui/InlineConfirm';
import { GoalForm } from './GoalForm';
import { GoalSteps } from './GoalSteps';
import type { Goal, GoalCreate, GoalUpdate } from '../../types';
import { cn } from '../../utils/cn';
import { formatDuration } from '../../utils/time';

interface GoalListProps {
    goals: Goal[];
    onAddGoal: (data: GoalCreate) => Promise<unknown>;
    onEditGoal: (id: string, data: GoalUpdate) => Promise<unknown>;
    onDeleteGoal: (id: string) => Promise<unknown>;
}

const iconButton =
    'grid h-10 w-10 place-items-center rounded-[10px] text-[var(--color-ink-muted)] transition-colors touch-manipulation hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]';

const sectionLabel =
    'flex items-baseline justify-between font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]';

// Active first, then by priority (high > medium > low).
const priorityWeight = { high: 3, medium: 2, low: 1 };
const byPriority = (a: Goal, b: Goal) => priorityWeight[b.priority] - priorityWeight[a.priority];

export const GoalList: React.FC<GoalListProps> = ({ goals, onAddGoal, onEditGoal, onDeleteGoal }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
    const [switchingId, setSwitchingId] = useState<string | null>(null);

    const handleAddSubmit = async (data: GoalCreate | GoalUpdate) => {
        await onAddGoal(data as GoalCreate);
        setIsAdding(false);
    };

    const handleEditSubmit = async (id: string, data: GoalCreate | GoalUpdate) => {
        await onEditGoal(id, data as GoalUpdate);
        setEditingGoalId(null);
    };

    const toggleActive = async (goal: Goal) => {
        setSwitchingId(goal.id);
        try {
            await onEditGoal(goal.id, { is_active: !goal.is_active });
        } finally {
            setSwitchingId(null);
        }
    };

    const active = goals.filter((g) => g.is_active).sort(byPriority);
    const paused = goals.filter((g) => !g.is_active).sort(byPriority);

    const renderGoal = (goal: Goal) =>
        editingGoalId === goal.id ? (
            <GoalForm
                key={goal.id}
                initialData={goal}
                onSubmit={(data) => handleEditSubmit(goal.id, data)}
                onCancel={() => setEditingGoalId(null)}
            />
        ) : (
            <article
                key={goal.id}
                className={cn(
                    'grid gap-3 rounded-[16px] border p-4',
                    goal.is_active
                        ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
                        : 'border-dashed border-[var(--color-border)] bg-transparent',
                )}
            >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className={cn('min-w-0', !goal.is_active && 'opacity-60')}>
                        <h3 className="flex flex-wrap items-center gap-2 font-display text-[17px] font-semibold leading-tight text-[var(--color-ink)] break-words">
                            {goal.name}
                            <Badge priority={goal.priority} />
                        </h3>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--color-ink-muted)]">
                            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                            {formatDuration(goal.estimated_duration_minutes)} per session
                        </p>
                    </div>
                    <div className="flex items-center">
                        <button
                            type="button"
                            className={iconButton}
                            aria-label={`Edit ${goal.name}`}
                            title="Edit"
                            onClick={() => setEditingGoalId(goal.id)}
                        >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                        </button>
                        <InlineConfirm
                            promptMessage="Delete this goal?"
                            confirmLabel="Yes, remove"
                            onConfirm={async () => {
                                await onDeleteGoal(goal.id);
                            }}
                        >
                            {/* InlineConfirm is the button; this is only its face. */}
                            <span className={cn(iconButton, 'hover:text-[var(--color-error)]')} title="Delete">
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </span>
                        </InlineConfirm>
                    </div>
                </div>

                {/* Pausing keeps the goal and its steps; it just stops suggestions. */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={goal.is_active}
                    aria-label={`${goal.name}: suggestions ${goal.is_active ? 'on' : 'paused'}`}
                    disabled={switchingId === goal.id}
                    onClick={() => toggleActive(goal)}
                    className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 justify-self-start rounded-[10px] font-inter text-[13px] font-medium touch-manipulation disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]',
                        goal.is_active ? 'text-[var(--color-free)]' : 'text-[var(--color-ink-muted)]',
                    )}
                >
                    <span
                        aria-hidden="true"
                        className={cn(
                            'relative h-[22px] w-9 rounded-full transition-colors motion-reduce:transition-none',
                            goal.is_active ? 'bg-[var(--color-free)]' : 'bg-[var(--color-border)]',
                        )}
                    >
                        <span
                            className={cn(
                                'absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none',
                                goal.is_active && 'translate-x-[14px]',
                            )}
                        />
                    </span>
                    {goal.is_active ? 'Active' : 'Paused'}
                </button>

                {goal.is_active && (
                    <GoalSteps goal={goal} onSave={(steps) => onEditGoal(goal.id, { steps })} />
                )}
            </article>
        );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-[18px] font-semibold text-[var(--color-ink)]">Your goals</h2>
                <button
                    type="button"
                    onClick={() => setIsAdding(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-[var(--color-free)] px-4 font-inter text-[14px] font-semibold text-[var(--color-on-free)] transition-[filter] touch-manipulation hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] focus-visible:ring-offset-2"
                >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Add goal
                </button>
            </div>

            {isAdding && (
                <GoalForm onSubmit={handleAddSubmit} onCancel={() => setIsAdding(false)} />
            )}

            {goals.length === 0 && !isAdding && (
                <div className="grid justify-items-center gap-2 rounded-[16px] border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[12px] bg-[var(--color-free-tint)] text-[var(--color-free)]">
                        <Target className="h-5 w-5" />
                    </span>
                    <p className="font-inter text-[15px] text-[var(--color-ink-muted)]">
                        No goals yet. Add your first goal to get started.
                    </p>
                </div>
            )}

            {active.length > 0 && (
                <section aria-label="Active goals" className="grid gap-3">
                    <p className={sectionLabel}>
                        Active <span className="font-mono tracking-normal">{active.length}</span>
                    </p>
                    {active.map(renderGoal)}
                </section>
            )}

            {paused.length > 0 && (
                <section aria-label="Paused goals" className="grid gap-3">
                    <p className={sectionLabel}>
                        Paused <span className="font-mono tracking-normal">{paused.length}</span>
                    </p>
                    {paused.map(renderGoal)}
                </section>
            )}
        </div>
    );
};
