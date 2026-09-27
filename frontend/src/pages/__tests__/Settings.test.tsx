import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../Settings';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const authed = (overrides = {}) => ({
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': {
        body: makeUser({
            onboarding_completed_at: '2026-02-01T00:00:00Z',
            day_start_time: '06:00:00',
            day_end_time: '23:00:00',
            ...overrides,
        }),
    },
});

describe('Settings — name', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('lets an account without a name add one', async () => {
        const fetchMock = mockFetch({
            ...authed({ full_name: null }),
            '/api/users/me/preferences': { body: {} },
        });

        renderWithProviders(<Settings />);

        expect(await screen.findByText('No name yet')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Add your name' }));
        await userEvent.type(screen.getByLabelText('Full name'), '  Ismaeel Shaikh ');
        await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

        await waitFor(() => {
            const patch = fetchMock.mock.calls.find(([url]) => String(url).includes('/preferences'));
            expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ full_name: 'Ismaeel Shaikh' });
        });
    }, 15000);

    it('will not save a blank name', async () => {
        mockFetch(authed({ full_name: 'Ismaeel' }));

        renderWithProviders(<Settings />);

        await userEvent.click(await screen.findByRole('button', { name: 'Edit name' }));
        await userEvent.clear(screen.getByLabelText('Full name'));
        await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

        expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    });
});

describe('Settings — active hours', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('shows the hours in AM / PM, never 24-hour time', async () => {
        mockFetch(authed());

        renderWithProviders(<Settings />);

        expect(await screen.findByLabelText('From')).toHaveTextContent('6:00 AM');
        expect(screen.getByLabelText('To')).toHaveTextContent('11:00 PM');
        expect(screen.getByText('17 hr')).toBeInTheDocument();
    });

    it('picks a time from hour, minute and AM / PM columns', async () => {
        mockFetch(authed());

        renderWithProviders(<Settings />);
        await userEvent.click(await screen.findByLabelText('To'));

        const hours = within(screen.getByRole('listbox', { name: 'Hour' }));
        expect(hours.getAllByRole('option')).toHaveLength(12);
        expect(hours.queryByRole('option', { name: '23' })).not.toBeInTheDocument();
        expect(
            within(screen.getByRole('listbox', { name: 'AM or PM' })).getByRole('option', { name: 'PM' }),
        ).toHaveAttribute('aria-selected', 'true');

        await userEvent.click(hours.getByRole('option', { name: '9' }));
        await userEvent.click(
            within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: '30' }),
        );

        expect(screen.getByLabelText('To')).toHaveTextContent('9:30 PM');
    });

    it('keeps a saved minute that is off the 5-minute grid', async () => {
        mockFetch(authed({ day_end_time: '23:59:00' }));

        renderWithProviders(<Settings />);

        const to = await screen.findByLabelText('To');
        expect(to).toHaveTextContent('11:59 PM');
        await userEvent.click(to);
        expect(
            within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: '59' }),
        ).toHaveAttribute('aria-selected', 'true');
    });

    it('saves the chosen hours as 24-hour values for the API', async () => {
        const fetchMock = mockFetch({ ...authed(), '/api/users/me/preferences': { body: {} } });

        renderWithProviders(<Settings />);
        await userEvent.click(await screen.findByLabelText('To'));
        await userEvent.click(
            within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '9' }),
        );
        await userEvent.click(
            within(screen.getByRole('listbox', { name: 'Minute' })).getByRole('option', { name: '30' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save active hours' }));

        await waitFor(() => {
            const patch = fetchMock.mock.calls.find(([url]) => String(url).includes('/preferences'));
            expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
                day_start_time: '06:00:00',
                day_end_time: '21:30:00',
            });
        });
    });
});
