import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Signup } from '../Signup';
import { mockFetch, renderWithProviders } from '../../test/utils';

const fillAllBut = async (skip: 'name' | null = null) => {
    if (skip !== 'name') await userEvent.type(screen.getByLabelText('Full name'), 'Ismaeel Shaikh');
    await userEvent.type(screen.getByLabelText('Email address'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
};

describe('Signup', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('asks for a full name before anything else', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });

        renderWithProviders(<Signup />);

        const fields = await screen.findAllByRole('textbox');
        expect(fields[0]).toHaveAccessibleName('Full name');
    });

    it('will not sign up with a blank name', async () => {
        const fetchMock = mockFetch({ '/auth/refresh': { status: 401 } });

        renderWithProviders(<Signup />);
        await screen.findByLabelText('Full name');
        // Spaces get past the browser's own "required" check; ours catches them.
        await userEvent.type(screen.getByLabelText('Full name'), '   ');
        await fillAllBut('name');
        await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

        expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/signup'))).toBe(false);
    });

    it('names every missing field on an empty submit', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Signup />);

        await userEvent.click(await screen.findByRole('button', { name: 'Sign up' }));

        expect(screen.getByText('Enter your name.')).toBeInTheDocument();
        expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
        expect(screen.getByText('Choose a password.')).toBeInTheDocument();
        expect(screen.getByText('Type the password again.')).toBeInTheDocument();
    });

    it('ticks off the password rules as they are met', async () => {
        mockFetch({ '/auth/refresh': { status: 401 } });
        renderWithProviders(<Signup />);

        await userEvent.type(await screen.findByLabelText('Password'), 'abcdefgh');

        expect(screen.getByText('At least 8 characters')).toHaveTextContent('(done)');
        expect(screen.getByText('A number')).toHaveTextContent('(not yet)');
    });

    it('sends the name with the signup', async () => {
        const fetchMock = mockFetch({
            '/auth/refresh': { status: 401 },
            '/auth/signup': { status: 201, body: { access_token: 'tok' } },
        });

        renderWithProviders(<Signup />);
        await screen.findByLabelText('Full name');
        await fillAllBut();
        await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

        await waitFor(() => {
            const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/signup'));
            expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
                full_name: 'Ismaeel Shaikh',
                email: 'new@example.com',
            });
        });
    });
});
