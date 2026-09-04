import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ProtectedRoute,
    RequireIncompleteOnboarding,
    RequireOnboarding,
} from '../ProtectedRoute';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const Tree = () => (
    <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route element={<ProtectedRoute />}>
            <Route element={<RequireIncompleteOnboarding />}>
                <Route path="/onboarding/schedule" element={<div>Onboarding step 1</div>} />
            </Route>
            <Route element={<RequireOnboarding />}>
                <Route path="/dashboard" element={<div>Dashboard screen</div>} />
            </Route>
        </Route>
    </Routes>
);

describe('route guards', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('sends an unauthenticated visitor to login', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Tree />, { route: '/dashboard' });

        expect(await screen.findByText('Login screen')).toBeInTheDocument();
    });

    it('keeps a user who has not finished onboarding out of the dashboard', async () => {
        mockFetch({
            '/auth/refresh': { body: { access_token: 'tok' } },
            '/auth/me': { body: makeUser({ onboarding_completed_at: null }) },
        });
        renderWithProviders(<Tree />, { route: '/dashboard' });

        expect(await screen.findByText('Onboarding step 1')).toBeInTheDocument();
    });

    it('lets an onboarded user reach the dashboard', async () => {
        mockFetch({
            '/auth/refresh': { body: { access_token: 'tok' } },
            '/auth/me': {
                body: makeUser({ onboarding_completed_at: '2026-02-01T10:00:00Z' }),
            },
        });
        renderWithProviders(<Tree />, { route: '/dashboard' });

        expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
    });

    it('keeps an onboarded user out of the setup wizard', async () => {
        mockFetch({
            '/auth/refresh': { body: { access_token: 'tok' } },
            '/auth/me': {
                body: makeUser({ onboarding_completed_at: '2026-02-01T10:00:00Z' }),
            },
        });
        renderWithProviders(<Tree />, { route: '/onboarding/schedule' });

        await waitFor(() =>
            expect(screen.getByText('Dashboard screen')).toBeInTheDocument(),
        );
    });
});
