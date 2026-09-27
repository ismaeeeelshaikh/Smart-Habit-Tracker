import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { Priority, GoalCreate, GoalUpdate } from '../../types';

interface GoalFormProps {
    initialData?: GoalUpdate & { id?: string };
    onSubmit: (data: GoalCreate | GoalUpdate) => Promise<unknown>;
    onCancel: () => void;
}

export const GoalForm: React.FC<GoalFormProps> = ({ initialData, onSubmit, onCancel }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [priority, setPriority] = useState<Priority | ''>(initialData?.priority || '');
    const [duration, setDuration] = useState(initialData?.estimated_duration_minutes?.toString() || '');
    
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        if (!name.trim()) {
            setError('Name is required.');
            return;
        }

        if (!priority) {
            setError('Priority is required.');
            return;
        }

        const durationNum = parseInt(duration, 10);
        if (isNaN(durationNum) || durationNum <= 0) {
            setError('Duration must be a positive number.');
            return;
        }

        setIsSubmitting(true);
        try {
            await onSubmit({
                name,
                priority: priority as Priority,
                estimated_duration_minutes: durationNum,
            });
        } catch (err: any) {
            setError(err.message || "Couldn't save that goal. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 border border-[var(--color-free)]/40 bg-[var(--color-surface)] rounded-[16px]">
            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Goal Name (e.g. Learn React)</label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    required
                />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Priority</label>
                <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="flex h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[15px] text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)] disabled:cursor-not-allowed disabled:opacity-50"
                    required
                >
                    <option value="" disabled>Select priority...</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Estimated Duration (minutes)</label>
                <Input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    required
                />
            </div>
            </div>

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} isLoading={isSubmitting}>
                    Save goal
                </Button>
            </div>
        </form>
    );
};
