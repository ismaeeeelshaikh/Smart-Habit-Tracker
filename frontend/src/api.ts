let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
    accessToken = token;
};

export const getAccessToken = () => accessToken;

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    }
    
    const response = await fetch(endpoint, {
        ...options,
        headers
    });
    
    return response;
};

import type { ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate, Goal, GoalCreate, GoalUpdate } from './types';

// Schedule API
export const getScheduleBlocks = async (): Promise<ScheduleBlock[]> => {
    const res = await apiFetch('/api/schedule/');
    if (!res.ok) throw new Error('Failed to fetch schedule blocks');
    return res.json();
};

export const createScheduleBlock = async (data: ScheduleBlockCreate): Promise<ScheduleBlock> => {
    const res = await apiFetch('/api/schedule/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create block');
    }
    return res.json();
};

export const updateScheduleBlock = async (id: string, data: ScheduleBlockUpdate): Promise<ScheduleBlock> => {
    const res = await apiFetch(`/api/schedule/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update block');
    return res.json();
};

export const deleteScheduleBlock = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/schedule/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete block');
};

// Goals API
export const getGoals = async (): Promise<Goal[]> => {
    const res = await apiFetch('/api/goals/');
    if (!res.ok) throw new Error('Failed to fetch goals');
    return res.json();
};

export const createGoal = async (data: GoalCreate): Promise<Goal> => {
    const res = await apiFetch('/api/goals/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to create goal');
    return res.json();
};

export const updateGoal = async (id: string, data: GoalUpdate): Promise<Goal> => {
    const res = await apiFetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Failed to update goal');
    return res.json();
};

export const deleteGoal = async (id: string): Promise<void> => {
    const res = await apiFetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete goal');
};
