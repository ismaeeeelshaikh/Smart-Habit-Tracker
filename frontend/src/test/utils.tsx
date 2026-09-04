import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import type { User } from '../types';

export const makeUser = (overrides: Partial<User> = {}): User => ({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'user@example.com',
    timezone: 'UTC',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    onboarding_completed_at: null,
    telegram_username: null,
    telegram_linked: false,
    ...overrides,
});

/** Minimal fetch stub: map a URL substring to the JSON body it should return. */
export const mockFetch = (
    routes: Record<string, { status?: number; body?: unknown }>,
): ReturnType<typeof vi.fn> => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        const key = Object.keys(routes).find((k) => url.includes(k));
        const route = key ? routes[key] : undefined;
        const status = route?.status ?? (route ? 200 : 404);
        return new Response(route?.body === undefined ? null : JSON.stringify(route.body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    });
    vi.stubGlobal('fetch', fn);
    return fn as unknown as ReturnType<typeof vi.fn>;
};

export const renderWithProviders = (ui: ReactElement, { route = '/' } = {}) =>
    render(
        <AuthProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </AuthProvider>,
    );
