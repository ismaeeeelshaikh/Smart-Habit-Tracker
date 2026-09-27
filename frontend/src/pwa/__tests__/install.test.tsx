import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUser, mockFetch } from '../../test/utils';

/** A fake Chrome install offer: records whether our button opened it. */
const installEvent = (outcome: 'accepted' | 'dismissed' = 'accepted') => {
    const event = new Event('beforeinstallprompt') as Event & {
        prompt: ReturnType<typeof vi.fn>;
        userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome });
    return event;
};

const authed = {
    '/auth/refresh': { body: { access_token: 'tok' } },
    '/auth/me': { body: makeUser({ onboarding_completed_at: '2026-02-01T00:00:00Z' }) },
};

// The install store is module-level, so each test gets a fresh copy.
const load = async () => {
    vi.resetModules();
    const install = await import('../install');
    const { Settings } = await import('../../pages/Settings');
    // Same fresh module graph as Settings, so they share one AuthContext.
    const { renderWithProviders } = await import('../../test/utils');
    install.initInstallPrompt();
    return { install, Settings, renderWithProviders };
};

describe('installing the app', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('offers nothing until the browser says it can install', async () => {
        const { Settings, renderWithProviders } = await load();
        mockFetch(authed);

        renderWithProviders(<Settings />);

        await screen.findByText('Active hours');
        expect(screen.queryByText('Install the app')).not.toBeInTheDocument();
    });

    it('opens the browser’s install dialog from Settings', async () => {
        const { Settings, renderWithProviders } = await load();
        mockFetch(authed);
        renderWithProviders(<Settings />);
        await screen.findByText('Active hours');

        const event = installEvent();
        act(() => {
            window.dispatchEvent(event);
        });
        await userEvent.click(await screen.findByRole('button', { name: 'Install app' }));

        expect(event.prompt).toHaveBeenCalledOnce();
        // Installed now, so the card goes away.
        expect(screen.queryByText('Install the app')).not.toBeInTheDocument();
    });

    it('tells an iPhone user how to add it to the home screen', async () => {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        );
        const { Settings, renderWithProviders } = await load();
        mockFetch(authed);

        renderWithProviders(<Settings />);

        expect(await screen.findByText('Install the app')).toBeInTheDocument();
        expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
        vi.restoreAllMocks();
    });
});
