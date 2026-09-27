import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPassword } from '../ForgotPassword';
import { Login } from '../Login';
import { mockFetch, renderWithProviders } from '../../test/utils';

const Tree = () => (
    <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<Login />} />
    </Routes>
);

describe('ForgotPassword', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('is linked from the sign-in screen', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Tree />, { route: '/login' });

        expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    });

    it('checks the email before asking for a code', async () => {
        const fetchMock = mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Tree />, { route: '/forgot-password' });

        await userEvent.type(await screen.findByLabelText('Email address'), 'me@gmail');
        await userEvent.click(screen.getByRole('button', { name: 'Send code' }));

        expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/forgot-password'))).toBe(false);
    });

    it('takes the code and a new password, then returns to sign in', async () => {
        const fetchMock = mockFetch({
            '/auth/refresh': { status: 401 },
            '/auth/forgot-password': { body: { detail: 'If an account uses that email, a code is on its way.' } },
            '/auth/reset-password': { status: 204 },
        });
        renderWithProviders(<Tree />, { route: '/forgot-password' });

        await userEvent.type(await screen.findByLabelText('Email address'), 'me@example.com');
        await userEvent.click(screen.getByRole('button', { name: 'Send code' }));

        await userEvent.type(await screen.findByLabelText('6-digit code'), '123456');
        await userEvent.type(screen.getByLabelText('New password'), 'newpassword9');
        await userEvent.type(screen.getByLabelText('Confirm new password'), 'newpassword9');
        await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

        expect(await screen.findByText('Password changed. Sign in with the new one.')).toBeInTheDocument();
        const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/reset-password'));
        expect(JSON.parse(String(call?.[1]?.body))).toEqual({
            email: 'me@example.com',
            code: '123456',
            new_password: 'newpassword9',
        });
    }, 15000);

    it('shows the server’s answer for a wrong code', async () => {
        mockFetch({
            '/auth/refresh': { status: 401 },
            '/auth/forgot-password': { body: { detail: 'ok' } },
            '/auth/reset-password': {
                status: 400,
                body: { detail: "That code isn't right or has expired. Check it, or send a new one." },
            },
        });
        renderWithProviders(<Tree />, { route: '/forgot-password' });

        await userEvent.type(await screen.findByLabelText('Email address'), 'me@example.com');
        await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
        await userEvent.type(await screen.findByLabelText('6-digit code'), '000000');
        await userEvent.type(screen.getByLabelText('New password'), 'newpassword9');
        await userEvent.type(screen.getByLabelText('Confirm new password'), 'newpassword9');
        await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent("That code isn't right or has expired."),
        );
    }, 15000);
});
