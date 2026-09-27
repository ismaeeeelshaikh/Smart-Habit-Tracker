import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from '../Login';
import { mockFetch, renderWithProviders } from '../../test/utils';

describe('Login validation', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('says which fields are missing instead of sending an empty form', async () => {
        const fetchMock = mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Login />);

        await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

        expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
        expect(screen.getByText('Enter your password.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/login'))).toBe(false);
    });

    it('catches a malformed email when the field is left', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Login />);

        await userEvent.type(await screen.findByLabelText('Email address'), 'ismaeel@gmail');
        await userEvent.tab();

        expect(await screen.findByText(/Enter a valid email address/)).toBeInTheDocument();
    });

    it('explains a wrong password plainly', async () => {
        mockFetch({
            '/auth/refresh': { status: 401 },
            '/auth/login': { status: 401, body: { detail: 'Incorrect email or password' } },
        });
        renderWithProviders(<Login />);

        await userEvent.type(await screen.findByLabelText('Email address'), 'me@example.com');
        await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
        await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match.');
    });

    it('can show the password while typing it', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Login />);

        const field = await screen.findByLabelText('Password');
        expect(field).toHaveAttribute('type', 'password');
        await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
        expect(field).toHaveAttribute('type', 'text');
    });
});
