import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stats } from '../Stats';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const authed = {
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': { body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
};

const tally = (completed: number, total: number, completion_rate: number) => ({
    completed,
    total,
    completion_rate,
});

const makeStats = (overrides = {}) => ({
    timezone: 'UTC',
    week_start: '2026-09-07',
    week_end: '2026-09-13',
    by_priority: {
        high: tally(3, 4, 75),
        medium: tally(1, 2, 50),
        low: tally(0, 0, 0),
    },
    overall: tally(4, 6, 67),
    most_skipped: { label: 'Reading', skips: 3 },
    total_actions: 9,
    ...overrides,
});

describe('Stats', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('shows a completion rate per priority tier', async () => {
        mockFetch({ ...authed, '/api/stats/weekly': { body: makeStats() } });

        renderWithProviders(<Stats />);

        expect(await screen.findByText('75%')).toBeInTheDocument();
        expect(screen.getByText('3 of 4 completed')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
        expect(screen.getByText('1 of 2 completed')).toBeInTheDocument();
    });

    it('names the most skipped goal with its count', async () => {
        mockFetch({ ...authed, '/api/stats/weekly': { body: makeStats() } });

        renderWithProviders(<Stats />);

        expect(await screen.findByText('Reading')).toBeInTheDocument();
        expect(screen.getByText(/skipped 3 times/)).toBeInTheDocument();
    });

    it('says so plainly when nothing was skipped', async () => {
        mockFetch({
            ...authed,
            '/api/stats/weekly': { body: makeStats({ most_skipped: null }) },
        });

        renderWithProviders(<Stats />);

        expect(await screen.findByText('Nothing skipped this week.')).toBeInTheDocument();
    });

    it('reports an empty week per week, not as a blanket empty state', async () => {
        mockFetch({
            ...authed,
            '/api/stats/weekly': {
                body: makeStats({ total_actions: 0, most_skipped: null }),
            },
        });

        renderWithProviders(<Stats />);

        expect(
            await screen.findByText('No activity recorded for this week.'),
        ).toBeInTheDocument();
    });

    it('re-fetches when navigating to the previous week', async () => {
        const fetchMock = mockFetch({ ...authed, '/api/stats/weekly': { body: makeStats() } });

        renderWithProviders(<Stats />);
        await screen.findByText('75%');

        await userEvent.click(screen.getByRole('button', { name: '← Previous' }));

        const asked = fetchMock.mock.calls.map(([url]) => String(url));
        expect(asked.some((url) => url.includes('week_start='))).toBe(true);
    });

    it('will not navigate past the current week', async () => {
        mockFetch({ ...authed, '/api/stats/weekly': { body: makeStats() } });

        renderWithProviders(<Stats />);
        await screen.findByText('75%');

        expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled();
    });

    it('offers a retry when the week fails to load', async () => {
        const fetchMock = mockFetch({ ...authed, '/api/stats/weekly': { status: 500 } });

        renderWithProviders(<Stats />);

        const retry = await screen.findByRole('button', { name: 'Retry' });
        expect(screen.getByText("Couldn't load stats for this week.")).toBeInTheDocument();

        const before = fetchMock.mock.calls.length;
        await userEvent.click(retry);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
});
