import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalSteps } from '../goals/GoalSteps';
import { mockFetch } from '../../test/utils';
import type { Goal, GoalStep } from '../../types';

const goal = (steps: GoalStep[] = []): Goal => ({
    id: 'g1',
    user_id: 'u1',
    name: 'DSA',
    priority: 'high',
    estimated_duration_minutes: 30,
    is_active: true,
    steps,
});

const SAVED: GoalStep[] = [
    { title: 'Arrays', done: true },
    { title: 'Strings', done: false },
    { title: 'Trees', done: false },
];

describe('GoalSteps', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('offers to break down a goal that has no steps', () => {
        mockFetch({});
        render(<GoalSteps goal={goal()} onSave={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Break it down' })).toBeInTheDocument();
    });

    it('shows progress and today’s step for a goal that has them', () => {
        mockFetch({});
        render(<GoalSteps goal={goal(SAVED)} onSave={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Steps 1\/3/ })).toHaveTextContent('Today: Strings');
    });

    it('says when every step is done', () => {
        mockFetch({});
        render(<GoalSteps goal={goal([{ title: 'Arrays', done: true }])} onSave={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Steps 1\/1/ })).toHaveTextContent('All done');
    });

    it('ticking a step saves the whole list with it done', async () => {
        mockFetch({});
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<GoalSteps goal={goal(SAVED)} onSave={onSave} />);

        await userEvent.click(screen.getByRole('button', { name: /Steps 1\/3/ }));
        await userEvent.click(screen.getByRole('checkbox', { name: 'Strings' }));

        expect(onSave).toHaveBeenCalledWith([
            { title: 'Arrays', done: true },
            { title: 'Strings', done: true },
            { title: 'Trees', done: false },
        ]);
    });

    it('proposes steps with the note, lets them be edited, and saves nothing until told', async () => {
        const fetchMock = mockFetch({
            '/api/goals/g1/breakdown': { body: { steps: ['Two pointers', 'Sliding window', 'Recursion'] } },
        });
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<GoalSteps goal={goal()} onSave={onSave} />);

        await userEvent.click(screen.getByRole('button', { name: 'Break it down' }));
        await userEvent.type(screen.getByLabelText(/What do you already know/), 'I know arrays');
        await userEvent.click(screen.getByRole('button', { name: 'Suggest steps' }));

        expect(await screen.findByDisplayValue('Sliding window')).toBeInTheDocument();
        const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/breakdown'));
        expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ note: 'I know arrays' });
        expect(onSave).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Remove step 3' }));
        await userEvent.type(screen.getByLabelText('New step'), 'Mock test{Enter}');
        await userEvent.click(screen.getByRole('button', { name: 'Save 3 steps' }));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith([
                { title: 'Two pointers', done: false },
                { title: 'Sliding window', done: false },
                { title: 'Mock test', done: false },
            ]),
        );
    });

    it('keeps the ticks of steps it keeps when the list is edited', async () => {
        mockFetch({});
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<GoalSteps goal={goal(SAVED)} onSave={onSave} />);

        await userEvent.click(screen.getByRole('button', { name: 'Edit steps' }));
        await userEvent.click(screen.getByRole('button', { name: 'Remove step 3' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save 2 steps' }));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith([
                { title: 'Arrays', done: true },
                { title: 'Strings', done: false },
            ]),
        );
    });

    it('says so when the model is unavailable, and steps can still be written by hand', async () => {
        mockFetch({ '/api/goals/g1/breakdown': { status: 503, body: { detail: 'The model is busy right now.' } } });
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<GoalSteps goal={goal()} onSave={onSave} />);

        await userEvent.click(screen.getByRole('button', { name: 'Break it down' }));
        await userEvent.click(screen.getByRole('button', { name: 'Suggest steps' }));

        expect(await screen.findByText('The model is busy right now.')).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText('New step'), 'Arrays{Enter}');
        await userEvent.click(screen.getByRole('button', { name: 'Save 1 step' }));
        await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ title: 'Arrays', done: false }]));
    });
});
