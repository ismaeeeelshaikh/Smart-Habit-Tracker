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
    // A week out, so it is always upcoming.
    scheduled_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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

    it('lists an upcoming reminder of your own', async () => {
        mockFetch({ ...authed, '/api/reminders/': { body: [makeReminder()] } });

        renderWithProviders(<Reminders />);

        expect(await screen.findByText('Call the dentist')).toBeInTheDocument();
        // No status filters or pills: this screen is only what's coming up.
        expect(screen.queryByText('Pending')).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });

    it('keeps a repeating reminder even though its first time has passed', async () => {
        mockFetch({
            ...authed,
            '/api/reminders/': {
                body: [
                    makeReminder({
                        scheduled_time: '2026-01-05T09:00:00Z',
                        is_recurring: true,
                        recurrence_rule: 'weekdays',
                    }),
                ],
            },
        });

        renderWithProviders(<Reminders />);

        expect(await screen.findByText('Repeats on weekdays')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Repeating' })).toBeInTheDocument();
    });

    it('leaves out goal suggestions and reminders already past', async () => {
        mockFetch({
            ...authed,
            '/api/reminders/': {
                body: [
                    makeReminder({ id: 'g', goal_id: 'goal-1', label: 'DSA' }),
                    makeReminder({ id: 'p', label: 'Old task', scheduled_time: '2026-01-05T09:00:00Z' }),
                ],
            },
        });

        renderWithProviders(<Reminders />);

        expect(await screen.findByText('No reminders coming up.')).toBeInTheDocument();
        expect(screen.queryByText('DSA')).not.toBeInTheDocument();
        expect(screen.queryByText('Old task')).not.toBeInTheDocument();
    });

    it('deletes a reminder after an inline confirm', async () => {
        const fetchMock = mockFetch({
            ...authed,
            '/api/reminders/': { body: [makeReminder()] },
            '/api/reminders/r1': { status: 204 },
        });

        renderWithProviders(<Reminders />);

        await userEvent.click(await screen.findByRole('button', { name: 'Delete this reminder?' }));
        await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));

        await waitFor(() => expect(screen.queryByText('Call the dentist')).not.toBeInTheDocument());
        const deleted = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
        expect(String(deleted?.[0])).toContain('/api/reminders/r1');
        expect(await screen.findByText('No reminders coming up.')).toBeInTheDocument();
    });

    it('offers a retry when the list fails to load', async () => {
        const fetchMock = mockFetch({
            ...authed,
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
            '/api/reminders/': { body: [] },
        });

        renderWithProviders(<Reminders />);

        await userEvent.click(await screen.findByRole('button', { name: 'Add reminder' }));
        await userEvent.type(screen.getByLabelText('Remind me to'), 'Stretch');
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
        mockFetch({ ...authed, '/api/reminders/': { body: [] } });

        renderWithProviders(<Reminders />);

        await userEvent.click(await screen.findByRole('button', { name: 'Add reminder' }));
        await userEvent.type(screen.getByLabelText('Remind me to'), 'Too late');
        fireEvent.change(screen.getByLabelText('When'), {
            target: { value: '2020-01-01T09:00' },
        });
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText('Pick a time in the future.')).toBeInTheDocument();
    });
});
