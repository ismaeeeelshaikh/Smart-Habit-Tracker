import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../Dashboard';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const emptyWeek = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };

const weekFreeSlots = (slotsByDay = {}) => ({
    day_start_time: '06:00:00',
    day_end_time: '23:00:00',
    min_slot_minutes: 15,
    slots_by_day: { ...emptyWeek, ...slotsByDay },
});

/** Auth plus the cards every Dashboard render fetches. */
const authed = (overrides = {}) => ({
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': {
        body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z', ...overrides }),
    },
    '/api/stats/weekly': { body: makeStats() },
    '/api/slots/free': { body: weekFreeSlots() },
});

const block = (overrides = {}) => ({
    id: 'b1',
    user_id: 'u1',
    day_of_week: 'mon',
    label: 'Lectures',
    start_time: '09:00:00',
    end_time: '13:00:00',
    is_flexible_block: false,
    flexible_availability: null,
    remind_before_minutes: null,
    ...overrides,
});

const makeStats = (overrides = {}) => ({
    timezone: 'UTC',
    week_start: '2026-09-07',
    week_end: '2026-09-13',
    by_priority: {
        high: { completed: 0, total: 0, completion_rate: 0 },
        medium: { completed: 0, total: 0, completion_rate: 0 },
        low: { completed: 0, total: 0, completion_rate: 0 },
    },
    overall: { completed: 3, total: 4, completion_rate: 75 },
    most_skipped: null,
    total_actions: 5,
    ...overrides,
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
    beforeEach(() => {
        vi.unstubAllGlobals();
        // Monday 2026-09-07, 12:00 UTC — the user's timezone is UTC.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('draws today’s committed blocks and free gaps on one line', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': {
                body: [block(), block({ id: 'b2', day_of_week: 'tue', label: 'Gym' })],
            },
            '/api/slots/free': {
                body: weekFreeSlots({
                    mon: [
                        {
                            day_of_week: 'mon',
                            start_time: '13:00:00',
                            end_time: '23:00:00',
                            duration_minutes: 600,
                        },
                    ],
                }),
            },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        expect(
            await screen.findByRole('button', { name: 'Lectures · 9:00 AM – 1:00 PM' }),
        ).toBeInTheDocument();
        // Tuesday's block is not today's.
        expect(screen.queryByRole('button', { name: /^Gym/ })).not.toBeInTheDocument();
        expect(screen.getByText('10 hr')).toBeInTheDocument();
        // It's noon, inside the lecture block.
        expect(screen.getByText('Now · Lectures · 9:00 AM – 1:00 PM')).toBeInTheDocument();
    });

    it('explains a segment when it is tapped', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': { body: [block()] },
            '/api/slots/free': {
                body: weekFreeSlots({
                    mon: [
                        {
                            day_of_week: 'mon',
                            start_time: '13:00:00',
                            end_time: '23:00:00',
                            duration_minutes: 600,
                        },
                    ],
                }),
            },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        await userEvent.click(
            await screen.findByRole('button', { name: /^Free · 1:00 PM – 11:00 PM/ }),
        );
        expect(screen.getByText('Free · 1:00 PM – 11:00 PM · 10 hr')).toBeInTheDocument();
    });

    it('marks the free slot you are in right now', async () => {
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
                            start: '2026-09-07T11:00:00',
                            end: '2026-09-07T14:00:00',
                            duration_minutes: 180,
                        },
                    ],
                },
            },
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('Now')).toBeInTheDocument();
    });

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

        expect(await screen.findByText('5:00 PM – 10:00 PM')).toBeInTheDocument();
        expect(screen.getByText('5 hr')).toBeInTheDocument();
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
                            current_step: 'Hooks',
                        },
                    ],
                    reason: null,
                },
            },
        });

        renderWithProviders(<Dashboard />);

        // The hero asks about the first task; Up next lists the whole plan.
        const upNext = within(await screen.findByRole('region', { name: 'Up next' }));
        expect(await upNext.findByText('Learn React')).toBeInTheDocument();
        expect(upNext.getByText('— today: Hooks')).toBeInTheDocument();
        expect(upNext.getByText('High')).toBeInTheDocument();
        expect(screen.getByText('5:00 PM · 20 min')).toBeInTheDocument();
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

    it('summarises the week as a single completion rate', async () => {
        mockFetch({ ...authed(), '/api/schedule/': { body: [] }, ...noSlots, ...noSuggestion });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('75%')).toBeInTheDocument();
        expect(screen.getByText('3 of 4')).toBeInTheDocument();
    });

    it('draws one bar per day when the week has activity', async () => {
        const byDay = ['07', '08', '09', '10', '11', '12', '13'].map((d, i) => ({
            date: `2026-09-${d}`,
            completed: i === 0 ? 3 : 0,
            total: i === 0 ? 4 : 0,
            completion_rate: i === 0 ? 75 : 0,
        }));
        mockFetch({
            ...authed(),
            '/api/stats/weekly': { body: makeStats({ by_day: byDay }) },
            '/api/schedule/': { body: [] },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByLabelText('Monday: 3 of 4 done')).toBeInTheDocument();
        expect(screen.getByLabelText('Tuesday: nothing yet')).toBeInTheDocument();
    });

    it('asks for patience in the first week instead of showing 0%', async () => {
        mockFetch({
            ...authed(),
            '/api/stats/weekly': { body: makeStats({ total_actions: 0 }) },
            '/api/schedule/': { body: [] },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        expect(
            await screen.findByText(
                'Not enough data yet — check back after your first few reminders.',
            ),
        ).toBeInTheDocument();
    });

    it('says stats are unavailable rather than showing a blank week', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            ...noSlots,
            ...noSuggestion,
            '/api/stats/weekly': { status: 500 },
        });

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('Stats unavailable.')).toBeInTheDocument();
    });

    it('drops the Telegram banner once connected', async () => {
        mockFetch({
            ...authed({ telegram_linked: true, telegram_username: 'ismaeel' }),
            '/api/schedule/': { body: [] },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        await screen.findByText('Up next');
        expect(screen.queryByText(/reminders won't be delivered/)).not.toBeInTheDocument();
    });

    it('leads with the free time left right now', async () => {
        mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            '/api/slots/free': {
                body: weekFreeSlots({
                    mon: [
                        {
                            day_of_week: 'mon',
                            start_time: '11:00:00',
                            end_time: '14:00:00',
                            duration_minutes: 180,
                        },
                    ],
                }),
            },
            ...noSlots,
            ...noSuggestion,
        });

        renderWithProviders(<Dashboard />);

        // 12:00 now, free until 2 PM.
        expect(await screen.findByText('Free right now')).toBeInTheDocument();
        expect(screen.getByText('2h')).toBeInTheDocument();
    });

    it('answers the suggestion from the web, the same way Telegram does', async () => {
        const fetchMock = mockFetch({
            ...authed(),
            '/api/schedule/': { body: [] },
            ...noSlots,
            '/api/slots/next': {
                body: {
                    timezone: 'UTC',
                    slot: {
                        day_of_week: 'mon',
                        date: '2026-09-07',
                        start: '2026-09-07T12:00:00',
                        end: '2026-09-07T13:00:00',
                        duration_minutes: 60,
                    },
                    allocations: [
                        {
                            goal_id: 'g1',
                            goal_name: 'Learn React',
                            priority: 'high',
                            minutes: 30,
                            start: '2026-09-07T12:00:00',
                            end: '2026-09-07T12:30:00',
                        },
                    ],
                    reason: null,
                },
            },
            // Telegram already sent this one, so the web answers it.
            '/api/reminders/': {
                body: [
                    {
                        id: 'r1',
                        user_id: 'u1',
                        goal_id: 'g1',
                        label: 'Learn React',
                        scheduled_time: '2026-09-07T12:00:00Z',
                        status: 'pending',
                        is_recurring: false,
                        recurrence_rule: 'none',
                    },
                ],
            },
            '/api/reminders/r1/status': { body: { id: 'r1', status: 'skipped' } },
        });

        renderWithProviders(<Dashboard />);

        await userEvent.click(await screen.findByRole('button', { name: 'Skip' }));

        expect(
            await screen.findByText('Learn React skipped for today. No worries — see you tomorrow.'),
        ).toBeInTheDocument();
        const put = fetchMock.mock.calls.find(([url]) => String(url).includes('/r1/status'));
        expect(JSON.parse(String(put?.[1]?.body))).toEqual({ status: 'skipped' });
    });
});
