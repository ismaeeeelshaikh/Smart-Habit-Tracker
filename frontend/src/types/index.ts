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
    /** Null for accounts made before signup asked for it. */
    full_name: string | null;
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
    /** Weekdays the app stays quiet every week: no lecture warnings, no suggestions. */
    quiet_days: DayOfWeek[];
}

export interface PreferencesUpdate {
    full_name?: string;
    timezone?: string;
    day_start_time?: string;
    day_end_time?: string;
    /** Replaces the whole set. */
    quiet_days?: DayOfWeek[];
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
    /** Minutes of warning before it starts. Null stays quiet, which is the default. */
    remind_before_minutes: number | null;
}

export interface ScheduleBlockCreate {
    day_of_week: DayOfWeek;
    label: string;
    is_flexible_block: boolean;
    start_time?: string | null;
    end_time?: string | null;
    flexible_availability?: FlexibleAvailability | null;
    remind_before_minutes?: number | null;
}

export type ScheduleBlockUpdate = Partial<ScheduleBlockCreate>;

/** A date the app stays quiet: no lecture warnings, no suggestions. */
export interface DayOff {
    id: string;
    date: string;
    label: string;
    created_at: string;
}

export interface DayOffCreate {
    label: string;
    start_date: string;
    /** Blank means just the one day. */
    end_date?: string | null;
}

/** One row the model proposed from a described week. Nothing is saved yet. */
export interface ScheduleDraftBlock {
    day_of_week: DayOfWeek;
    label: string;
    start_time: string;
    end_time: string;
}

export interface ScheduleDraft {
    blocks: ScheduleDraftBlock[];
    /** One sentence per row that was dropped, so a misread class is visible. */
    skipped: string[];
}

/** One piece of a bigger goal. The first one not done is "today's". */
export interface GoalStep {
    title: string;
    done: boolean;
}

export interface Goal {
    id: string;
    user_id: string;
    name: string;
    priority: Priority;
    estimated_duration_minutes: number;
    is_active: boolean;
    steps: GoalStep[];
}

export interface GoalCreate {
    name: string;
    priority: Priority;
    estimated_duration_minutes: number;
    is_active?: boolean;
}

export type GoalUpdate = Partial<GoalCreate> & {
    /** Replaces the whole list. */
    steps?: GoalStep[];
};

/** A proposed goal, sized to the user's free time. Nothing is saved until added. */
export interface GoalSuggestion {
    name: string;
    priority: Priority;
    estimated_duration_minutes: number;
    /** One sentence on why this, for this person. */
    reason: string;
}

export interface GoalSuggestions {
    suggestions: GoalSuggestion[];
    /** One sentence per suggestion that was dropped, e.g. too long for any gap. */
    skipped: string[];
}

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
    /** The goal's first unfinished step ("Strings"), when it has steps. */
    current_step?: string | null;
}

export interface NextSuggestion {
    timezone: string;
    slot: UpcomingSlot | null;
    allocations: Allocation[];
    /** Present when there's nothing to suggest, explaining why. */
    reason: string | null;
}

// --- Reminders -------------------------------------------------------------

export type ReminderStatus = 'pending' | 'done' | 'later' | 'skipped';
export type RecurrenceRule = 'none' | 'daily' | 'weekdays';

export interface Reminder {
    id: string;
    user_id: string;
    /** Null for a one-off, or once the goal it came from was deleted. */
    goal_id: string | null;
    /** Snapshot of the goal name at creation — never re-read from the goal. */
    label: string;
    scheduled_time: string;
    status: ReminderStatus;
    is_recurring: boolean;
    recurrence_rule: RecurrenceRule;
}

/**
 * Exactly one of `goal_id` / `label` — the server rejects both or neither, and
 * derives `is_recurring` from the rule.
 */
export interface ReminderCreate {
    goal_id?: string | null;
    label?: string | null;
    scheduled_time: string;
    recurrence_rule?: RecurrenceRule;
}

export interface ReminderFilters {
    status?: ReminderStatus;
    start?: string;
    end?: string;
}

// --- Telegram --------------------------------------------------------------

export interface LinkCode {
    code: string;
    expires_at: string;
    bot_username: string;
}

export interface LinkStatus {
    linked: boolean;
    telegram_username: string | null;
}

// --- Stats -----------------------------------------------------------------

export interface CompletionTally {
    completed: number;
    total: number;
    /** Already rounded to a whole percent by the server. */
    completion_rate: number;
}

export interface DayTally extends CompletionTally {
    /** Local date, "2026-09-07". */
    date: string;
}

export interface WeeklyStats {
    timezone: string;
    /** Monday of the week, as a local date. */
    week_start: string;
    week_end: string;
    by_priority: Record<Priority, CompletionTally>;
    overall: CompletionTally;
    /** Monday to Sunday, always seven entries. */
    by_day: DayTally[];
    most_skipped: { label: string; skips: number } | null;
    /**
     * Raw completion_logs rows in the week. Zero means nothing happened at all,
     * which reads differently from a 0% completion rate.
     */
    total_actions: number;
}
