export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Priority = 'high' | 'medium' | 'low';

export interface User {
    id: string;
    email: string;
    timezone: string;
    is_active: boolean;
    created_at: string;
    /** Null until the user finishes onboarding — drives the setup redirect. */
    onboarding_completed_at: string | null;
    telegram_username: string | null;
    telegram_linked: boolean;
}

export interface ScheduleBlock {
    id: string;
    user_id: string;
    day_of_week: DayOfWeek;
    label: string;
    is_flexible_block: boolean;
    start_time: string | null; // HH:MM:SS format from backend
    end_time: string | null;
}

export interface ScheduleBlockCreate {
    day_of_week: DayOfWeek;
    label: string;
    is_flexible_block: boolean;
    start_time?: string | null;
    end_time?: string | null;
}

export interface ScheduleBlockUpdate extends Partial<ScheduleBlockCreate> {}

export interface Goal {
    id: string;
    user_id: string;
    name: string;
    priority: Priority;
    estimated_duration_minutes: number;
    is_active: boolean;
}

export interface GoalCreate {
    name: string;
    priority: Priority;
    estimated_duration_minutes: number;
    is_active?: boolean;
}

export interface GoalUpdate extends Partial<GoalCreate> {}
