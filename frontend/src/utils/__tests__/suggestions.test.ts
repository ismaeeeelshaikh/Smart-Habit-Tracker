import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actOnSuggestion } from '../suggestions';
import type { Allocation, UpcomingSlot } from '../../types';

const slot: UpcomingSlot = {
    day_of_week: 'mon',
    date: '2026-09-07',
    start: '2026-09-07T17:40:00',
    end: '2026-09-07T20:00:00',
    duration_minutes: 140,
};

const allocation: Allocation = {
    goal_id: 'g1',
    goal_name: 'DSA',
    priority: 'high',
    minutes: 45,
    start: '2026-09-07T17:40:00',
    end: '2026-09-07T18:25:00',
};

const reminder = (overrides = {}) => ({
    id: 'r1',
    user_id: 'u1',
    goal_id: 'g1',
    label: 'DSA',
    scheduled_time: '2026-09-07T16:00:00Z',
    status: 'pending',
    is_recurring: false,
    recurrence_rule: 'none',
    ...overrides,
});

type Call = { url: string; method: string; body?: unknown };

/** Records every request; answers by method + path. */
const stubApi = (handlers: Record<string, (call: Call) => { status?: number; body?: unknown }>) => {
    const calls: Call[] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input.toString();
            const method = init?.method ?? 'GET';
            const call = { url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined };
            calls.push(call);
            const key = Object.keys(handlers).find((k) => {
                const [m, path] = k.split(' ');
                return m === method && url.includes(path);
            });
            const res = key ? handlers[key](call) : { status: 404 };
            return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
                status: res.status ?? 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }),
    );
    return calls;
};

describe('actOnSuggestion', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('answers the reminder Telegram already sent instead of adding a second', async () => {
        const calls = stubApi({
            'GET /api/reminders/': () => ({ body: [reminder()] }),
            'PUT /api/reminders/r1/status': () => ({ body: reminder({ status: 'done' }) }),
        });

        await actOnSuggestion(allocation, slot, 'done');

        expect(calls.some((c) => c.method === 'POST')).toBe(false);
        expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { status: 'done' } });
        // Looks back an hour: a slot under way reports its start as "now".
        expect(decodeURIComponent(calls[0].url)).toContain('start=2026-09-07T16:40:00');
    });

    it('creates the reminder itself when nothing was sent yet', async () => {
        const calls = stubApi({
            'GET /api/reminders/': () => ({ body: [reminder({ goal_id: 'other' })] }),
            'POST /api/reminders/': () => ({ status: 201, body: reminder({ id: 'new' }) }),
            'PUT /api/reminders/new/status': () => ({ body: reminder({ status: 'skipped' }) }),
        });

        await actOnSuggestion(allocation, slot, 'skipped');

        expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
            goal_id: 'g1',
            scheduled_time: '2026-09-07T17:40:00',
        });
        expect(calls.at(-1)).toMatchObject({ body: { status: 'skipped' } });
    });

    it('re-dates to now when the allocation has slipped into the past', async () => {
        let posts = 0;
        const calls = stubApi({
            'GET /api/reminders/': () => ({ body: [] }),
            'POST /api/reminders/': () =>
                ++posts === 1
                    ? { status: 422, body: { detail: 'scheduled_time must be in the future.' } }
                    : { status: 201, body: reminder({ id: 'new' }) },
            'PUT /api/reminders/new/status': () => ({ body: reminder({ status: 'later' }) }),
        });

        await actOnSuggestion(allocation, slot, 'later');

        const retry = calls.filter((c) => c.method === 'POST')[1];
        expect((retry.body as { scheduled_time: string }).scheduled_time).toMatch(/Z$/);
    });
});
