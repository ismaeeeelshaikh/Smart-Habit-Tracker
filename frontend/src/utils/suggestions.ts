/**
 * Answering a suggestion from the web — the same Done / Later / Skip the
 * Telegram buttons send, through the same two endpoints, so stats and the
 * dispatcher's "leave them alone" rule can't tell which one was pressed.
 *
 * A suggestion only becomes a reminder row when something acts on it: the
 * dispatcher creates one as it sends the Telegram message. So the web first
 * looks for that row and answers it; only if Telegram hasn't sent one yet does
 * it create the row itself. Otherwise one suggestion would count twice.
 */
import { ApiError, createReminder, getReminders, updateReminderStatus } from '../api';
import type { Allocation, Reminder, ReminderStatus, UpcomingSlot } from '../types';

export type SuggestionAction = Exclude<ReminderStatus, 'pending'>;

/**
 * How far before the slot's reported start to look for its reminder. A slot
 * already underway is reported as starting "now", so the reminder Telegram sent
 * when it opened is dated earlier than the slot. Matches the dispatcher's
 * 60-minute cooldown (QUIET_MINUTES_AFTER_REMINDER).
 */
const LOOKBACK_MINUTES = 60;

/** Shift a naive local "2026-09-07T17:40:00" by some minutes, staying naive. */
const shiftLocal = (iso: string, minutes: number): string =>
    new Date(new Date(`${iso.slice(0, 19)}Z`).getTime() + minutes * 60_000)
        .toISOString()
        .slice(0, 19);

/** Reminders that may belong to this slot. Naive times are the user's local time. */
export const getSlotReminders = (slot: UpcomingSlot): Promise<Reminder[]> =>
    getReminders({ start: shiftLocal(slot.start, -LOOKBACK_MINUTES), end: slot.end });

/** The reminder already standing for this allocation, if Telegram (or we) made one. */
export const findReminderFor = (
    reminders: Reminder[],
    allocation: Allocation,
): Reminder | undefined => reminders.find((r) => r.goal_id === allocation.goal_id);

export const actOnSuggestion = async (
    allocation: Allocation,
    slot: UpcomingSlot,
    action: SuggestionAction,
): Promise<Reminder> => {
    let reminder = findReminderFor(await getSlotReminders(slot), allocation);

    if (!reminder) {
        try {
            reminder = await createReminder({
                goal_id: allocation.goal_id,
                scheduled_time: allocation.start,
            });
        } catch (e) {
            // The allocation can start a few minutes in the past (a slot under
            // way starts "now" when it was computed); the API refuses a one-off
            // dated too far back, so date it to this moment instead.
            if (!(e instanceof ApiError) || e.status !== 422) throw e;
            reminder = await createReminder({
                goal_id: allocation.goal_id,
                scheduled_time: new Date().toISOString(),
            });
        }
    }

    return updateReminderStatus(reminder.id, action);
};
