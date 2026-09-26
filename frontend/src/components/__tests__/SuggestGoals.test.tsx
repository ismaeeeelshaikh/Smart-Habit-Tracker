import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuggestGoals } from '../goals/SuggestGoals';
import { mockFetch } from '../../test/utils';

const suggestions = {
    suggestions: [
        { name: 'Mock interviews', priority: 'high', estimated_duration_minutes: 45, reason: 'Placements are near' },
        { name: 'Aptitude', priority: 'medium', estimated_duration_minutes: 20, reason: 'First placement round' },
    ],
    skipped: ['Left out Marathon training (90 min): your longest free gap is 60 min.'],
};

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, urlPart: string) => {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(urlPart));
    if (!call) throw new Error(`no request to ${urlPart}`);
    return JSON.parse((call[1] as RequestInit).body as string);
};

describe('SuggestGoals', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('sends what the user wrote and lists what came back, with why', async () => {
        const fetchMock = mockFetch({ '/api/goals/suggest': { body: suggestions } });
        render(<SuggestGoals onAdd={vi.fn()} />);

        await userEvent.type(screen.getByLabelText('About you (optional)'), 'final year, placements');
        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));

        expect(await screen.findByText('Mock interviews')).toBeInTheDocument();
        expect(screen.getByText('Placements are near')).toBeInTheDocument();
        expect(screen.getByText('45 min')).toBeInTheDocument();
        expect(bodyOf(fetchMock, '/api/goals/suggest')).toEqual({ about: 'final year, placements' });
    });

    it('works with nothing written', async () => {
        const fetchMock = mockFetch({ '/api/goals/suggest': { body: suggestions } });
        render(<SuggestGoals onAdd={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));

        expect(await screen.findByText('Aptitude')).toBeInTheDocument();
        expect(bodyOf(fetchMock, '/api/goals/suggest')).toEqual({ about: '' });
    });

    it('adds a suggestion only when asked, as an ordinary goal', async () => {
        mockFetch({ '/api/goals/suggest': { body: suggestions } });
        const onAdd = vi.fn().mockResolvedValue(undefined);
        render(<SuggestGoals onAdd={onAdd} />);

        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));
        await screen.findByText('Aptitude');
        expect(onAdd).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: 'Add Aptitude' }));

        expect(onAdd).toHaveBeenCalledWith({ name: 'Aptitude', priority: 'medium', estimated_duration_minutes: 20 });
        expect(await screen.findByRole('button', { name: 'Aptitude added' })).toBeDisabled();
        // The other one is still there to add.
        expect(screen.getByRole('button', { name: 'Add Mock interviews' })).toBeEnabled();
    });

    it('shows what it left out and why', async () => {
        mockFetch({ '/api/goals/suggest': { body: suggestions } });
        render(<SuggestGoals onAdd={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));

        expect(await screen.findByText(/longest free gap is 60 min/)).toBeInTheDocument();
    });

    it('says so when the model is unavailable', async () => {
        mockFetch({ '/api/goals/suggest': { status: 503, body: { detail: 'The model is busy right now.' } } });
        render(<SuggestGoals onAdd={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));

        expect(await screen.findByText('The model is busy right now.')).toBeInTheDocument();
    });

    it('explains a failed add and lets it be tried again', async () => {
        mockFetch({ '/api/goals/suggest': { body: suggestions } });
        const onAdd = vi.fn().mockRejectedValue(new Error("Couldn't save that goal. Please try again."));
        render(<SuggestGoals onAdd={onAdd} />);

        await userEvent.click(screen.getByRole('button', { name: 'Suggest goals' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Add Aptitude' }));

        expect(await screen.findByText(/Couldn't save that goal/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Add Aptitude' })).toBeEnabled());
    });
});
