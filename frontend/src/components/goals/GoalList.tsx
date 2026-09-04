import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { InlineConfirm } from '../ui/InlineConfirm';
import { GoalForm } from './GoalForm';
import type { Goal, GoalCreate, GoalUpdate } from '../../types';

interface GoalListProps {
    goals: Goal[];
    onAddGoal: (data: GoalCreate) => Promise<unknown>;
    onEditGoal: (id: string, data: GoalUpdate) => Promise<unknown>;
    onDeleteGoal: (id: string) => Promise<unknown>;
}

export const GoalList: React.FC<GoalListProps> = ({ goals, onAddGoal, onEditGoal, onDeleteGoal }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

    const handleAddSubmit = async (data: GoalCreate | GoalUpdate) => {
        await onAddGoal(data as GoalCreate);
        setIsAdding(false);
    };

    const handleEditSubmit = async (id: string, data: GoalCreate | GoalUpdate) => {
        await onEditGoal(id, data as GoalUpdate);
        setEditingGoalId(null);
    };

    const toggleDeactivate = async (goal: Goal) => {
        await onEditGoal(goal.id, { is_active: !goal.is_active });
    };

    // Sort goals: active first, then by priority (high > medium > low)
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const sortedGoals = [...goals].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return priorityWeight[b.priority] - priorityWeight[a.priority];
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Your Goals</h2>
                <Button onClick={() => setIsAdding(true)}>Add goal</Button>
            </div>

            {isAdding && (
                <div className="mb-4">
                    <GoalForm
                        onSubmit={handleAddSubmit}
                        onCancel={() => setIsAdding(false)}
                    />
                </div>
            )}

            {sortedGoals.length === 0 && !isAdding && (
                <div className="text-center p-8 border border-dashed border-border rounded-lg text-muted-foreground">
                    No goals yet. Add your first goal to get started.
                </div>
            )}

            <div className="flex flex-col gap-3">
                {sortedGoals.map(goal => (
                    <div key={goal.id}>
                        {editingGoalId === goal.id ? (
                            <GoalForm
                                initialData={goal}
                                onSubmit={(data) => handleEditSubmit(goal.id, data)}
                                onCancel={() => setEditingGoalId(null)}
                            />
                        ) : (
                            <div className={`flex items-center justify-between p-4 rounded-lg border bg-card transition-colors ${!goal.is_active ? 'opacity-60 border-border bg-muted/20' : 'border-border hover:border-primary/50'}`}>
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-medium ${!goal.is_active && 'line-through text-muted-foreground'}`}>
                                            {goal.name}
                                        </span>
                                        <Badge priority={goal.priority} />
                                        {!goal.is_active && (
                                            <span className="inline-flex items-center px-[10px] py-[4px] rounded-full font-inter font-medium text-[12px] leading-none bg-muted text-muted-foreground">
                                                Paused
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {goal.estimated_duration_minutes} minutes
                                    </p>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <Button 
                                        variant="secondary" 
                                        className="text-sm px-3 py-1.5 h-auto"
                                        onClick={() => toggleDeactivate(goal)}
                                    >
                                        {goal.is_active ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        className="text-sm px-3 py-1.5 h-auto"
                                        onClick={() => setEditingGoalId(goal.id)}
                                    >
                                        Edit
                                    </Button>
                                    <InlineConfirm
                                        promptMessage="Delete this goal?"
                                        confirmLabel="Yes, remove"
                                        onConfirm={async () => {
                                            await onDeleteGoal(goal.id);
                                        }}
                                    >
                                        <Button variant="secondary" className="text-sm px-3 py-1.5 h-auto">Delete</Button>
                                    </InlineConfirm>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
