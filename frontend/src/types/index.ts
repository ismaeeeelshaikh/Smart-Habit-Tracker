export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Priority = 'high' | 'medium' | 'low';

/**
 * What a no-fixed-time block means to the slot engine.
 * 'busy' blocks the whole day ("Sunday: Family"); 'free' blocks nothing
 * ("Saturday: Mostly Free").
 */
export type FlexibleAvailability = 'free' | 'busy';

export interface User {
    id: string;
    email: string;
    timezone: string;
    is_active: boolean;
    created_at: string;
    /** Null until the user finishes onboarding — drives the setup redirect. */
    onboarding_completed_at: string | null;
    /** Bounds free-slot detection. "HH:MM:SS". */
    day_start_time: string;
    day_end_time: string;
    telegram_username: string | null;
    telegram_linked: boolean;
}

export interface PreferencesUpdate {
    timezone?: string;
    day_start_time?: string;
    day_end_time?: string;
}

export interface ScheduleBlock {
    id: string;
    user_id: string;
    day_of_week: DayOfWeek;
    label: string;
    is_flexible_block: boolean;
    start_time: string | null; // HH:MM:SS format from backend
    end_time: string | null;
    flexible_availability: FlexibleAvailability | null;
}

export interface ScheduleBlockCreate {
    day_of_week: DayOfWeek;
    label: string;
    is_flexible_block: boolean;
    start_time?: string | null;
    end_time?: string | null;
    flexible_availability?: FlexibleAvailability | null;
}

export type ScheduleBlockUpdate = Partial<ScheduleBlockCreate>;

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

export type GoalUpdate = Partial<GoalCreate>;

// --- Slots -----------------------------------------------------------------

export interface FreeSlot {
    day_of_week: DayOfWeek;
    start_time: string;
    end_time: string;
    duration_minutes: number;
}

export interface UpcomingSlot {
    day_of_week: DayOfWeek;
    date: string;
    start: string;
    end: string;
    duration_minutes: number;
}

export interface WeekFreeSlots {
    day_start_time: string;
    day_end_time: string;
    min_slot_minutes: number;
    slots_by_day: Record<DayOfWeek, FreeSlot[]>;
}

export interface TodayFreeSlots {
    timezone: string;
    date: string;
    slots: UpcomingSlot[];
}

export interface Allocation {
    goal_id: string;
    goal_name: string;
    priority: Priority;
    minutes: number;
    start: string;
    end: string;
}

export interface NextSuggestion {
    timezone: string;
    slot: UpcomingSlot | null;
    allocations: Allocation[];
    /** Present when there's nothing to suggest, explaining why. */
    reason: string | null;
}
