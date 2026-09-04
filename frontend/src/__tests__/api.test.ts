import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ApiError,
    apiFetch,
    getGoals,
    setAccessToken,
    setSessionExpiredHandler,
} from '../api';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
    setSessionExpiredHandler(null);
});

describe('apiFetch', () => {
    it('attaches the bearer token when one is set', async () => {
        const fetchMock = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit) => json({ ok: true }),
        );
        vi.stubGlobal('fetch', fetchMock);
        setAccessToken('tok-123');

        await apiFetch('/api/goals/');

        const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer tok-123');
    });

    it('refreshes once and retries after a 401', async () => {
        setAccessToken('expired');
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json({ detail: 'expired' }, 401))
            .mockResolvedValueOnce(json({ access_token: 'fresh' }))
            .mockResolvedValueOnce(json([{ id: 'g1' }]));
        vi.stubGlobal('fetch', fetchMock);

        const res = await apiFetch('/api/goals/');

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1][0]).toBe('/auth/refresh');
        // The retry must carry the newly issued token, not the stale one.
        const retryHeaders = fetchMock.mock.calls[2][1].headers as Headers;
        expect(retryHeaders.get('Authorization')).toBe('Bearer fresh');
    });

    it('gives up and signals expiry when the refresh also fails', async () => {
        setAccessToken('expired');
        const onExpired = vi.fn();
        setSessionExpiredHandler(onExpired);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json({ detail: 'expired' }, 401))
            .mockResolvedValueOnce(json({ detail: 'nope' }, 401));
        vi.stubGlobal('fetch', fetchMock);

        const res = await apiFetch('/api/goals/');

        expect(res.status).toBe(401);
        expect(onExpired).toHaveBeenCalledOnce();
        // One refresh attempt only — no retry storm.
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe('typed endpoints', () => {
    it('surfaces the API detail message as an ApiError', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'Goal not found' }, 404)));

        await expect(getGoals()).rejects.toThrowError(ApiError);
        await expect(getGoals()).rejects.toThrow('Goal not found');
    });

    it('unwraps FastAPI validation errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => json({ detail: [{ loc: ['body'], msg: 'too short' }] }, 422)),
        );

        await expect(getGoals()).rejects.toThrow('too short');
    });
});
