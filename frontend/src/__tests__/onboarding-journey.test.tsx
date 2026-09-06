/**
 * The whole journey, once: sign up → onboarding → dashboard.
 *
 * Implementation Plan Phase 8 asks for "at least one full flow test". Every
 * other frontend test renders a single screen with its API stubbed, so nothing
 * covered the joins — the redirect after signup, the gate that blocks Continue
 * until a goal exists, or the switch from the onboarding layout to the app
 * shell once setup is marked complete. Those joins are exactly where a routing
 * change breaks the product without failing any existing test.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../App';
import { AuthProvider } from '../contexts/AuthContext';
import { makeUser } from '../test/utils';

/**
 * A stand-in backend that remembers what happened, so the journey progresses
 * the way the real one does: no goals until you add one, no dashboard until
 * onboarding is marked complete.
 */
const createBackend = () => {
    const state = {
        signedUp: false,
        onboardingComplete: false,
        goals: [] as unknown[],
        blocks: [] as unknown[],
    };

    const json = (body: unknown, status = 200) =>
        new Response(body === null ? null : JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method ?? 'GET';

        if (url.includes('/auth/signup')) {
            state.signedUp = true;
            return json({ access_token: 'tok' }, 201);
        }
        if (url.includes('/auth/refresh')) {
            return state.signedUp ? json({ access_token: 'tok' }) : json(null, 401);
        }
        if (url.includes('/auth/me')) {
            if (!state.signedUp) return json(null, 401);
            return json(
                makeUser({
                    onboarding_completed_at: state.onboardingComplete
                        ? '2026-09-06T00:00:00Z'
                        : null,
                }),
            );
        }
        if (url.includes('/api/users/me/complete-onboarding')) {
            state.onboardingComplete = true;
            return json(makeUser({ onboarding_completed_at: '2026-09-06T00:00:00Z' }));
        }
        if (url.includes('/api/goals/')) {
            if (method === 'POST') {
                const goal = {
                    id: 'g1',
                    user_id: 'u1',
                    name: 'Learn Spanish',
                    priority: 'high',
                    estimated_duration_minutes: 30,
                    is_active: true,
                };
                state.goals.push(goal);
                return json(goal, 201);
            }
            return json(state.goals);
        }
        if (url.includes('/api/schedule/')) {
            return method === 'POST' ? json({ id: 'b1' }, 201) : json(state.blocks);
        }
        if (url.includes('/api/slots/free/today')) {
            return json({ timezone: 'UTC', date: '2026-09-06', slots: [] });
        }
        if (url.includes('/api/slots/next')) {
            return json({
                timezone: 'UTC',
                slot: null,
                allocations: [],
                reason: 'Add a goal to get personalized suggestions.',
            });
        }
        if (url.includes('/api/stats/weekly')) {
            return json({
                timezone: 'UTC',
                week_start: '2026-09-07',
                week_end: '2026-09-13',
                by_priority: {
                    high: { completed: 0, total: 0, completion_rate: 0 },
                    medium: { completed: 0, total: 0, completion_rate: 0 },
                    low: { completed: 0, total: 0, completion_rate: 0 },
                },
                overall: { completed: 0, total: 0, completion_rate: 0 },
                most_skipped: null,
                total_actions: 0,
            });
        }
        return json(null, 404);
    });

    vi.stubGlobal('fetch', fetchMock);
    return state;
};

const renderAt = (route: string) =>
    render(
        <AuthProvider>
            <MemoryRouter initialEntries={[route]}>
                <AppRoutes />
            </MemoryRouter>
        </AuthProvider>,
    );

describe('signup to dashboard', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('walks a new user all the way to the dashboard', async () => {
        const state = createBackend();
        renderAt('/signup');

        // --- sign up ---------------------------------------------------
        await userEvent.type(await screen.findByLabelText('Email address'), 'new@example.com');
        await userEvent.type(screen.getByLabelText('Password'), 'password123');
        await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
        await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

        // A brand new account lands in onboarding, never straight on the dashboard.
        expect(await screen.findByText(/Step 1 of 3/i)).toBeInTheDocument();

        // --- step 1: a schedule is optional ----------------------------
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(await screen.findByText(/Step 2 of 3/i)).toBeInTheDocument();

        // --- step 2: a goal is not ------------------------------------
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: /Add goal/i }));
        await userEvent.type(screen.getByPlaceholderText('Name'), 'Learn Spanish');
        await userEvent.selectOptions(screen.getByRole('combobox'), 'high');
        await userEvent.type(screen.getByRole('spinbutton'), '30');
        await userEvent.click(screen.getByRole('button', { name: /Save goal/i }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

        // --- step 3: telegram can wait ---------------------------------
        expect(await screen.findByText(/Step 3 of 3/i)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /Finish setup/i }));

        // --- and out into the app --------------------------------------
        await waitFor(() => expect(state.onboardingComplete).toBe(true));
        expect(await screen.findByText('Your Week')).toBeInTheDocument();
        // The app shell has replaced the onboarding layout.
        expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    }, 30000);

    it('sends someone who already finished setup straight to the dashboard', async () => {
        const state = createBackend();
        state.signedUp = true;
        state.onboardingComplete = true;

        renderAt('/onboarding/schedule');

        expect(await screen.findByText('Your Week')).toBeInTheDocument();
    }, 20000);

    it('keeps an unauthenticated visitor out of the app', async () => {
        createBackend();
        renderAt('/dashboard');

        expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    }, 20000);
});
