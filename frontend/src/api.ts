import type {
    Goal,
    GoalCreate,
    GoalUpdate,
    LinkCode,
    LinkStatus,
    NextSuggestion,
    PreferencesUpdate,
    Reminder,
    ReminderCreate,
    ReminderFilters,
    ReminderStatus,
    ScheduleBlock,
    ScheduleBlockCreate,
    ScheduleBlockUpdate,
    TodayFreeSlots,
    User,
    WeeklyStats,
    WeekFreeSlots,
} from './types';

let accessToken: string | null = null;
// Set by AuthContext so a failed silent refresh can tear the session down.
let onSessionExpired: (() => void) | null = null;

export const setAccessToken = (token: string | null) => {
    accessToken = token;
};

export const getAccessToken = () => accessToken;

export const setSessionExpiredHandler = (handler: (() => void) | null) => {
    onSessionExpired = handler;
};

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/** Pull the human-readable message out of FastAPI's error shapes. */
const readErrorDetail = async (res: Response, fallback: string): Promise<string> => {
    try {
        const body = await res.json();
        const detail = body?.detail;
        if (typeof detail === 'string') return detail;
        // 422 validation errors arrive as a list of {loc, msg, type}.
        if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    } catch {
        // Non-JSON body — fall through to the caller's message.
    }
    return fallback;
};

const requestRefresh = async (): Promise<boolean> => {
    try {
        const res = await fetch('/auth/refresh', { method: 'POST' });
        if (!res.ok) return false;
        const data = await res.json();
        setAccessToken(data.access_token);
        return true;
    } catch {
        return false;
    }
};

/**
 * Fetch with the bearer token attached. A 401 triggers one silent refresh and a
 * single retry — access tokens expire after 15 minutes, so an idle tab would
 * otherwise start failing mid-session.
 */
export const apiFetch = async (
    endpoint: string,
    options: RequestInit = {},
    retry = true,
): Promise<Response> => {
    const buildHeaders = () => {
        const headers = new Headers(options.headers || {});
        if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
        return headers;
    };

    const response = await fetch(endpoint, { ...options, headers: buildHeaders() });

    if (response.status === 401 && retry) {
        if (await requestRefresh()) {
            return apiFetch(endpoint, options, false);
        }
        onSessionExpired?.();
    }

    return response;
};

const request = async <T>(
    endpoint: string,
    options: RequestInit,
    fallbackError: string,
): Promise<T> => {
    const res = await apiFetch(endpoint, options);
    if (!res.ok) {
        throw new ApiError(await readErrorDetail(res, fallbackError), res.status);
    }
    return res.status === 204 ? (undefined as T) : res.json();
};

const jsonBody = (method: string, data: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});

// --- Auth / identity -------------------------------------------------------

export const getMe = (): Promise<User> =>
    request<User>('/auth/me', {}, "Couldn't load your account. Please try again.");

export const completeOnboarding = (): Promise<User> =>
    request<User>('/api/users/me/complete-onboarding', { method: 'POST' }, "Couldn't finish setup. Please try again.");

export const changePassword = (current_password: string, new_password: string): Promise<void> =>
    request<void>(
        '/auth/change-password',
        jsonBody('POST', { current_password, new_password }),
        "Couldn't change your password. Please try again.",
    );

export const updatePreferences = (data: PreferencesUpdate): Promise<User> =>
    request<User>(
        '/api/users/me/preferences',
        jsonBody('PATCH', data),
        "Couldn't save your preferences. Please try again.",
    );

// --- Slots -----------------------------------------------------------------

export const getWeekFreeSlots = (): Promise<WeekFreeSlots> =>
    request<WeekFreeSlots>('/api/slots/free', {}, "Couldn't load your schedule right now.");

export const getTodaysFreeSlots = (): Promise<TodayFreeSlots> =>
    request<TodayFreeSlots>(
        '/api/slots/free/today',
        {},
        "Couldn't load your schedule right now.",
    );

export const getNextSuggestion = (): Promise<NextSuggestion> =>
    request<NextSuggestion>('/api/slots/next', {}, "Couldn't load your schedule right now.");

// --- Schedule --------------------------------------------------------------

export const getScheduleBlocks = (): Promise<ScheduleBlock[]> =>
    request<ScheduleBlock[]>('/api/schedule/', {}, "Couldn't load your schedule. Please try again.");

export const createScheduleBlock = (data: ScheduleBlockCreate): Promise<ScheduleBlock> =>
    request<ScheduleBlock>('/api/schedule/', jsonBody('POST', data), "Couldn't save that block. Please try again.");

export const updateScheduleBlock = (
    id: string,
    data: ScheduleBlockUpdate,
): Promise<ScheduleBlock> =>
    request<ScheduleBlock>(`/api/schedule/${id}`, jsonBody('PUT', data), "Couldn't update that block. Please try again.");

export const deleteScheduleBlock = (id: string): Promise<void> =>
    request<void>(`/api/schedule/${id}`, { method: 'DELETE' }, "Couldn't delete that block. Please try again.");

// --- Goals -----------------------------------------------------------------

export const getGoals = (): Promise<Goal[]> =>
    request<Goal[]>('/api/goals/', {}, "Couldn't load your goals. Please try again.");

export const createGoal = (data: GoalCreate): Promise<Goal> =>
    request<Goal>('/api/goals/', jsonBody('POST', data), "Couldn't save that goal. Please try again.");

export const updateGoal = (id: string, data: GoalUpdate): Promise<Goal> =>
    request<Goal>(`/api/goals/${id}`, jsonBody('PUT', data), "Couldn't update that goal. Please try again.");

export const deleteGoal = (id: string): Promise<void> =>
    request<void>(`/api/goals/${id}`, { method: 'DELETE' }, "Couldn't delete that goal. Please try again.");

// --- Reminders -------------------------------------------------------------

export const getReminders = (filters: ReminderFilters = {}): Promise<Reminder[]> => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.start) params.set('start', filters.start);
    if (filters.end) params.set('end', filters.end);
    const query = params.toString();

    return request<Reminder[]>(
        `/api/reminders/${query ? `?${query}` : ''}`,
        {},
        "Couldn't load reminders.",
    );
};

export const createReminder = (data: ReminderCreate): Promise<Reminder> =>
    request<Reminder>(
        '/api/reminders/',
        jsonBody('POST', data),
        "Couldn't create reminder. Please try again.",
    );

export const updateReminderStatus = (id: string, status: ReminderStatus): Promise<Reminder> =>
    request<Reminder>(
        `/api/reminders/${id}/status`,
        jsonBody('PUT', { status }),
        "Couldn't update reminder.",
    );

// --- Telegram --------------------------------------------------------------

export const createLinkCode = (): Promise<LinkCode> =>
    request<LinkCode>(
        '/api/telegram/link',
        { method: 'POST' },
        "Couldn't generate a code. Please try again.",
    );

export const getLinkStatus = (): Promise<LinkStatus> =>
    request<LinkStatus>('/api/telegram/link/status', {}, "Couldn't check connection status.");

export const disconnectTelegram = (): Promise<LinkStatus> =>
    request<LinkStatus>(
        '/api/telegram/link',
        { method: 'DELETE' },
        "Couldn't disconnect Telegram. Please try again.",
    );

// --- Stats -----------------------------------------------------------------

/** `weekStart` may be any date in the week; the server snaps it to that Monday. */
export const getWeeklyStats = (weekStart?: string): Promise<WeeklyStats> =>
    request<WeeklyStats>(
        `/api/stats/weekly${weekStart ? `?week_start=${weekStart}` : ''}`,
        {},
        "Couldn't load stats for this week.",
    );
