import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalList } from '../goals/GoalList';
import type { Goal } from '../../types';

const goal = (overrides: Partial<Goal>): Goal => ({
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    name: 'LeetCode',
    priority: 'high',
    estimated_duration_minutes: 45,
    is_active: true,
    steps: [],
    ...overrides,
} as Goal);

const renderList = (goals: Goal[], onEditGoal = vi.fn().mockResolvedValue(undefined)) => {
    render(
        <GoalList goals={goals} onAddGoal={vi.fn()} onEditGoal={onEditGoal} onDeleteGoal={vi.fn()} />,
    );
    return onEditGoal;
};

describe('GoalList', () => {
    it('keeps paused goals apart from the active ones', () => {
        renderList([goal({ name: 'LeetCode' }), goal({ name: 'Guitar', is_active: false })]);

        const active = within(screen.getByRole('region', { name: 'Active goals' }));
        const paused = within(screen.getByRole('region', { name: 'Paused goals' }));
        expect(active.getByText('LeetCode')).toBeInTheDocument();
        expect(paused.getByText('Guitar')).toBeInTheDocument();
        expect(active.queryByText('Guitar')).not.toBeInTheDocument();
    });

    it('pauses a goal with its switch', async () => {
        const target = goal({ id: 'g1', name: 'LeetCode' });
        const onEditGoal = renderList([target]);

        const toggle = screen.getByRole('switch', { name: 'LeetCode: suggestions on' });
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(toggle);

        expect(onEditGoal).toHaveBeenCalledWith('g1', { is_active: false });
    });

    it('says how long a session is', () => {
        renderList([goal({ estimated_duration_minutes: 90 })]);

        expect(screen.getByText('1 hr 30 min per session')).toBeInTheDocument();
    });
});
