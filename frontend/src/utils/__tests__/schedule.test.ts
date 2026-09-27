import { describe, expect, it } from 'vitest';
import { busySpans } from '../schedule';
import type { ScheduleBlock } from '../../types';

const block = (overrides: Partial<ScheduleBlock>): ScheduleBlock => ({
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    day_of_week: 'mon',
    label: 'IOE',
    is_flexible_block: false,
    start_time: '09:00:00',
    end_time: '10:00:00',
    flexible_availability: null,
    remind_before_minutes: null,
    ...overrides,
});

describe('busySpans', () => {
    it('merges overlapping blocks so busy time is not counted twice', () => {
        const spans = busySpans(
            [
                block({ start_time: '09:00:00', end_time: '11:00:00' }),
                block({ start_time: '10:30:00', end_time: '12:00:00' }),
                block({ start_time: '14:00:00', end_time: '15:00:00' }),
            ],
            'mon',
            360,
            1380,
        );
        expect(spans).toEqual([
            { start: 540, end: 720 },
            { start: 840, end: 900 },
        ]);
    });

    it('treats a committed whole day as the full window', () => {
        const spans = busySpans(
            [block({ is_flexible_block: true, flexible_availability: 'busy', start_time: null, end_time: null })],
            'mon',
            360,
            1380,
        );
        expect(spans).toEqual([{ start: 360, end: 1380 }]);
    });
});
