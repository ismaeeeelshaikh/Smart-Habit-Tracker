import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../layout/AppLayout';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

describe('AppLayout mobile navigation', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        mockFetch({
            '/auth/refresh': { body: { access_token: 'tok' } },
            '/auth/me': { body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
        });
    });

    it('keeps the tab bar to five items, with the rest behind More', () => {
        renderWithProviders(<AppLayout />, { route: '/dashboard' });

        const tabs = within(screen.getByRole('navigation', { name: 'Primary' }));
        expect(tabs.getAllByRole('link').map((l) => l.textContent)).toEqual([
            'Dashboard',
            'Schedule',
            'Goals',
            'Stats',
        ]);
        expect(tabs.getByRole('button', { name: 'More' })).toBeInTheDocument();
    });

    it('opens a sheet with Reminders, Settings and Logout', async () => {
        renderWithProviders(<AppLayout />, { route: '/dashboard' });

        await userEvent.click(screen.getByRole('button', { name: 'More' }));

        const sheet = within(screen.getByRole('dialog', { name: 'More' }));
        expect(sheet.getByRole('link', { name: 'Reminders' })).toHaveAttribute('href', '/reminders');
        expect(sheet.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
        expect(sheet.getByRole('button', { name: 'Logout' })).toBeInTheDocument();

        await userEvent.click(sheet.getByRole('link', { name: 'Reminders' }));
        expect(screen.queryByRole('dialog', { name: 'More' })).not.toBeInTheDocument();
    });
});
