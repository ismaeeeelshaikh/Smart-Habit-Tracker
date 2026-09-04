import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Reminders } from '../Reminders';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const authed = {
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': { body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
};

const makeReminder = (overrides = {}) => ({
    id: 'r1',
    user_id: 'u1',
    goal_id: null,
    label: 'Call the dentist',
    scheduled_time: '2026-09-10T17:00:00Z',
    status: 'pending',
    is_recurring: false,
    recurrence_rule: 'none',
    ...overrides,
});

/** A datetime-local value ("YYYY-MM-DDTHH:mm") a week out, so it is always future. */
const futureLocalValue = () => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
};

describe('Reminders', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('lists a reminder with its status', async () => {
        mockFetch({
            ...authed,
            '/api/goals/': { body: [] },
            '/api/reminders/': { body: [makeReminder()] },
        });

        renderWithProviders(<Reminders />);

        expect(await screen.findByText('Call the dentist')).toBeInTheDocument();
        // Scoped to the pill: "Pending" is also one of the filter dropdown's options.
        expect(screen.getByText('Pending', { selector: 'span' })).toBeInTheDocument();
    });

    it('marks a recurring reminder as repeating', async () => {
        mockFetch({
            ...authed,
            '/api/goals/': { body: [] },
            '/api/reminders/': {
                body: [makeReminder({ is_recurring: true, recurrence_rule: 'weekdays' })],
            },
        });

        renderWithProviders(<Reminders />);

        expect(await screen.findByText('Repeats on weekdays')).toBeInTheDocument();
    });

    it('tells a brand-new user they have no reminders yet', async () => {
        mockFetch({ ...authed, '/api/goals/': { body: [] }, '/api/reminders/': { body: [] } });

        renderWithProviders(<Reminders />);

        expect(
            await screen.findByText("You don't have any reminders yet."),
        ).toBeInTheDocument();
    });

    it('distinguishes an empty filter from having no reminders at all', async () => {
        mockFetch({
            ...authed,
            '/api/goals/': { body: [] },
            // Order matters: the more specific key has to be matched first.
            '/api/reminders/?status=done': { body: [] },
            '/api/reminders/': { body: [makeReminder()] },
        });

        renderWithProviders(<Reminders />);
        await screen.findByText('Call the dentist');

        await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');

        expect(await screen.findByText('No reminders match this filter.')).toBeInTheDocument();
    });

    it('offers a retry when the list fails to load', async () => {
        const fetchMock = mockFetch({
            ...authed,
            '/api/goals/': { body: [] },
            '/api/reminders/': { status: 500 },
        });

        renderWithProviders(<Reminders />);

        const retry = await screen.findByRole('button', { name: 'Retry' });
        expect(screen.getByText("Couldn't load reminders.")).toBeInTheDocument();

        const before = fetchMock.mock.calls.length;
        await userEvent.click(retry);
        expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });

    it('creates a one-off reminder from the form', async () => {
        const fetchMock = mockFetch({
            ...authed,
            '/api/goals/': { body: [] },
            '/api/reminders/': { body: [] },
        });

        renderWithProviders(<Reminders />);

        await userEvent.click(await screen.findByRole('button', { name: 'Add manual reminder' }));
        await userEvent.type(screen.getByLabelText('Task name'), 'Stretch');
        // datetime-local doesn't accept typed input reliably; set it directly.
        fireEvent.change(screen.getByLabelText('When'), { target: { value: futureLocalValue() } });
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            const posted = fetchMock.mock.calls.find(
                ([url, init]) =>
                    String(url).includes('/api/reminders/') && init?.method === 'POST',
            );
            expect(posted).toBeDefined();
            expect(JSON.parse(posted![1].body)).toMatchObject({
                label: 'Stretch',
                goal_id: null,
                recurrence_rule: 'none',
            });
        });
    });

    it('refuses to schedule a one-off in the past', async () => {
        mockFetch({ ...authed, '/api/goals/': { body: [] }, '/api/reminders/': { body: [] } });

        renderWithProviders(<Reminders />);

        await userEvent.click(await screen.findByRole('button', { name: 'Add manual reminder' }));
        await userEvent.type(screen.getByLabelText('Task name'), 'Too late');
        fireEvent.change(screen.getByLabelText('When'), {
            target: { value: '2020-01-01T09:00' },
        });
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Pick a time in the future.')).toBeInTheDocument();
    });
});
