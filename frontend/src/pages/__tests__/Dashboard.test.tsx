import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../Dashboard';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const authed = (overrides = {}) => ({
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': {
        body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z', ...overrides }),
    },
});

const noSlots = {
    '/api/slots/free/today': { body: { timezone: 'UTC', date: '2026-09-07', slots: [] } },
};

const noSuggestion = {
    '/api/slots/next': {
        body: {
            timezone: 'UTC',
            slot: null,
            allocations: [],
            reason: 'Add a goal to get personalized suggestions.',
        },
    },
};

describe('Dashboard', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('lists today’s free slots with their durations', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            '/api/slots/free/today': {
                body: {
                    timezone: 'UTC',
                    date: '2026-09-07',
                    slots: [
                        {
                            day_of_week: 'mon',
                            date: '2026-09-07',
                            start: '2026-09-07T17:00:00',
                            end: '2026-09-07T22:00:00',
                            duration_minutes: 300,
                        },
                    ],
                },
            },
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('17:00 – 22:00')).toBeInTheDocument();
        expect(screen.getByText('300 min')).toBeInTheDocument();
    });

    it('shows the fully-booked empty state without framing it as a problem', async () => {
        mockFetch({ ...authed(), '/api/schedule/': { body: [] }, ...noSlots, ...noSuggestion });

        renderWithProviders(<Dashboard />);

        expect(
            await screen.findByText('No free time today — enjoy your full schedule!'),
        ).toBeInTheDocument();
    });

    it('renders the suggested allocation with its priority badge', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            ...noSlots,
            '/api/slots/next': {
                body: {
                    timezone: 'UTC',
                    slot: {
                        day_of_week: 'mon',
                        date: '2026-09-07',
                        start: '2026-09-07T17:00:00',
                        end: '2026-09-07T17:30:00',
                        duration_minutes: 30,
                    },
                    allocations: [
                        {
                            goal_id: 'g1',
                            goal_name: 'Learn React',
                            priority: 'high',
                            minutes: 20,
                            start: '2026-09-07T17:00:00',
                            end: '2026-09-07T17:20:00',
                        },
                    ],
                    reason: null,
                },
            },
        });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('Learn React')).toBeInTheDocument();
        expect(screen.getByText('High')).toBeInTheDocument();
        expect(screen.getByText('17:00 · 20 min')).toBeInTheDocument();
    });

    it('explains why there is no suggestion instead of showing a blank card', async () => {
        mockFetch({ ...authed(), '/api/schedule/': { body: [] }, ...noSlots, ...noSuggestion });

        renderWithProviders(<Dashboard />);

        expect(
            await screen.findByText('Add a goal to get personalized suggestions.'),
        ).toBeInTheDocument();
    });

    it('offers a retry when a card fails to load', async () => {
        const fetchMock = mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            '/api/slots/free/today': { status: 500 },
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        const retry = await screen.findByRole('button', { name: 'Retry' });
        expect(screen.getByText("Couldn't load your schedule right now.")).toBeInTheDocument();

        const before = fetchMock.mock.calls.length;
        await userEvent.click(retry);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });

    it('nudges the user to connect Telegram until they have', async () => {
        mockFetch({ ...authed(), '/api/schedule/': { body: [] }, ...noSlots, ...noSuggestion });

        renderWithProviders(<Dashboard />);

        expect(
            await screen.findByText(/reminders won't be delivered/),
        ).toBeInTheDocument();
    });

    it('drops the Telegram banner once connected', async () => {
        mockFetch({
            ...authed({ telegram_linked: true, telegram_username: 'ismaeel' }),
            '/api/schedule/': { body: [] },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        await screen.findByText('Your Week');
        expect(screen.queryByText(/reminders won't be delivered/)).not.toBeInTheDocument();
    });
});
