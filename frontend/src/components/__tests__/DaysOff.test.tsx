import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaysOff } from '../schedule/DaysOff';
import { mockFetch } from '../../test/utils';

const row = (id: string, date: string, label: string) => ({ id, date, label, created_at: '2026-09-26T00:00:00Z' });

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, method: string) => {
    const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === method);
    if (!call) throw new Error(`no ${method} request`);
    return JSON.parse((call[1] as RequestInit).body as string);
};

describe('DaysOff', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('shows back-to-back dates with one name as a single holiday', async () => {
        mockFetch({
            '/api/days-off/': {
                body: [
                    row('a', '2026-10-20', 'Diwali'),
                    row('b', '2026-10-21', 'Diwali'),
                    row('c', '2026-10-22', 'Diwali'),
                    row('d', '2026-11-05', 'Trip'),
                ],
            },
        });

        render(<DaysOff />);

        expect(await screen.findByText('Diwali')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        const [diwali, trip] = screen.getAllByRole('listitem');
        expect(diwali.textContent).toContain('–');
        expect(trip.textContent).not.toContain('–');
    });

    it('says when nothing is coming up', async () => {
        mockFetch({ '/api/days-off/': { body: [] } });

        render(<DaysOff />);

        expect(await screen.findByText('No days off coming up.')).toBeInTheDocument();
    });

    it('adds a range with a name', async () => {
        const fetchMock = mockFetch({ '/api/days-off/': { body: [] } });
        render(<DaysOff />);

        await userEvent.type(screen.getByLabelText('Name'), 'Diwali');
        fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-20' } });
        fireEvent.change(screen.getByLabelText('To (optional)'), { target: { value: '2026-10-23' } });
        await userEvent.click(screen.getByRole('button', { name: 'Add day off' }));

        await waitFor(() =>
            expect(bodyOf(fetchMock, 'POST')).toEqual({
                label: 'Diwali',
                start_date: '2026-10-20',
                end_date: '2026-10-23',
            }),
        );
    });

    it('a single day sends no end date', async () => {
        const fetchMock = mockFetch({ '/api/days-off/': { body: [] } });
        render(<DaysOff />);

        await userEvent.type(screen.getByLabelText('Name'), 'Eid');
        fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-01' } });
        await userEvent.click(screen.getByRole('button', { name: 'Add day off' }));

        await waitFor(() => expect(bodyOf(fetchMock, 'POST').end_date).toBeNull());
    });

    it('asks for a name and a date before sending anything', async () => {
        const fetchMock = mockFetch({ '/api/days-off/': { body: [] } });
        render(<DaysOff />);

        await userEvent.click(screen.getByRole('button', { name: 'Add day off' }));

        expect(await screen.findByText('Give the day a name and a date.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(
            false,
        );
    });

    it('removes every date of a holiday together', async () => {
        const fetchMock = mockFetch({
            '/api/days-off/': { body: [row('a', '2026-10-20', 'Diwali'), row('b', '2026-10-21', 'Diwali')] },
        });
        render(<DaysOff />);

        await userEvent.click(await screen.findByRole('button', { name: 'Remove Diwali' }));
        await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));

        await waitFor(() => {
            const deleted = fetchMock.mock.calls
                .filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')
                .map(([url]) => String(url));
            expect(deleted.some((u) => u.endsWith('/api/days-off/a'))).toBe(true);
            expect(deleted.some((u) => u.endsWith('/api/days-off/b'))).toBe(true);
        });
    });
});
