import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmail } from '../VerifyEmail';
import { ProtectedRoute, RequireVerifiedEmail } from '../../components/ProtectedRoute';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const unverified = (overrides = {}) => ({
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': { body: makeUser({ email: 'new@example.com', email_verified: false, ...overrides }) },
});

const Tree = () => (
    <Routes>
        <Route element={<ProtectedRoute />}>
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route element={<RequireVerifiedEmail />}>
                <Route path="/dashboard" element={<div>Dashboard screen</div>} />
                <Route path="/onboarding/schedule" element={<div>Onboarding step 1</div>} />
            </Route>
        </Route>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route path="/signup" element={<div>Signup screen</div>} />
    </Routes>
);

describe('VerifyEmail', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('sends an unverified account here before anything else', async () => {
        mockFetch(unverified());
        renderWithProviders(<Tree />, { route: '/dashboard' });

        expect(await screen.findByText('Check your email')).toBeInTheDocument();
        expect(screen.getByText('new@example.com')).toBeInTheDocument();
    });

    it('checks the code as soon as all six digits are in', async () => {
        const fetchMock = mockFetch({
            ...unverified(),
            '/auth/verify-email': { body: makeUser({ email_verified: true }) },
        });
        renderWithProviders(<Tree />, { route: '/verify-email' });

        // Pasting "123 456" keeps only the digits.
        await userEvent.type(await screen.findByLabelText('6-digit code'), '123 456');

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/verify-email'));
            expect(JSON.parse(String(call?.[1]?.body))).toEqual({ code: '123456' });
        });
    });

    it('says what went wrong with a wrong code', async () => {
        mockFetch({
            ...unverified(),
            '/auth/verify-email': { status: 400, body: { detail: "That code isn't right. 4 tries left." } },
        });
        renderWithProviders(<Tree />, { route: '/verify-email' });

        await userEvent.type(await screen.findByLabelText('6-digit code'), '000000');

        expect(await screen.findByText("That code isn't right. 4 tries left.")).toBeInTheDocument();
    });

    it('asks for all six digits before checking', async () => {
        const fetchMock = mockFetch(unverified());
        renderWithProviders(<Tree />, { route: '/verify-email' });

        await userEvent.type(await screen.findByLabelText('6-digit code'), '123');
        await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));

        expect(await screen.findByText('Enter all 6 digits.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/verify-email'))).toBe(false);
    });

    it('holds back a new code for a minute after the first one', async () => {
        mockFetch(unverified());
        renderWithProviders(<Tree />, { route: '/verify-email' });

        expect(await screen.findByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled();
    });

    it('lets a verified account through', async () => {
        mockFetch({
            '/auth/refresh': { body: { access_token: 'tok' } },
            '/auth/me': { body: makeUser({ email_verified: true, onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
        });
        renderWithProviders(<Tree />, { route: '/dashboard' });

        expect(await screen.findByText('Dashboard screen')).toBeInTheDocument();
    });
});
