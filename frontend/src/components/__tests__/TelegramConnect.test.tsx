import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramConnect } from '../telegram/TelegramConnect';
import { makeUser, mockFetch, renderWithProviders } from '../../test/utils';

const authed = {
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': { body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
};

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const codeRoute = (expires_at = inMinutes(10)) => ({
    '/api/telegram/link': { body: { code: 'ABCD2345', expires_at, bot_username: 'habitraker_bot' } },
});

describe('TelegramConnect', () => {
    beforeEach(() => vi.unstubAllGlobals());
    afterEach(() => vi.useRealTimers());

    it('shows only the generate button before a code exists', async () => {
        mockFetch({ ...authed });

        renderWithProviders(<TelegramConnect />);

        expect(
            await screen.findByRole('button', { name: 'Generate linking code' }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Waiting for connection/)).not.toBeInTheDocument();
    });

    it('shows the code and how to use it once generated', async () => {
        mockFetch({ ...authed, ...codeRoute() });

        renderWithProviders(<TelegramConnect />);
        await userEvent.click(await screen.findByRole('button', { name: 'Generate linking code' }));

        expect(await screen.findByText('ABCD2345')).toBeInTheDocument();
        expect(screen.getByText('@habitraker_bot')).toBeInTheDocument();
        expect(screen.getByText('Waiting for connection…')).toBeInTheDocument();
    });

    it('reports a generation failure instead of a blank panel', async () => {
        mockFetch({ ...authed, '/api/telegram/link': { status: 500 } });

        renderWithProviders(<TelegramConnect />);
        await userEvent.click(await screen.findByRole('button', { name: 'Generate linking code' }));

        expect(
            await screen.findByText("Couldn't generate a code. Please try again."),
        ).toBeInTheDocument();
    });

    it('switches to connected when polling sees the link', async () => {
        const onConnected = vi.fn();
        mockFetch({
            ...authed,
            // More specific first: the status URL also contains '/api/telegram/link'.
            '/api/telegram/link/status': { body: { linked: true, telegram_username: 'ismaeel' } },
            ...codeRoute(),
        });

        renderWithProviders(<TelegramConnect onConnected={onConnected} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Generate linking code' }));
        await screen.findByText('ABCD2345');

        expect(await screen.findByText('Connected ✅', {}, { timeout: 8000 })).toBeInTheDocument();
        await waitFor(() => expect(onConnected).toHaveBeenCalled());
    }, 15000);

    it('offers a fresh code once the current one expires', async () => {
        mockFetch({
            ...authed,
            '/api/telegram/link/status': { body: { linked: false, telegram_username: null } },
            // Already past its expiry when polling first checks.
            ...codeRoute(inMinutes(-1)),
        });

        renderWithProviders(<TelegramConnect />);
        await userEvent.click(await screen.findByRole('button', { name: 'Generate linking code' }));
        await screen.findByText('ABCD2345');

        expect(await screen.findByText('This code expired.', {}, { timeout: 8000 })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Generate a new code' }),
        ).toBeInTheDocument();
    }, 15000);
});
