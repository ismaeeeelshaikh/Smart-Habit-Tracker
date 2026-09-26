import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleList } from '../schedule/ScheduleList';
import type { ScheduleBlock } from '../../types';

const block = (overrides: Partial<ScheduleBlock>): ScheduleBlock => ({
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    day_of_week: 'mon',
    label: 'IOE',
    is_flexible_block: false,
    start_time: '09:05:00',
    end_time: '10:00:00',
    flexible_availability: null,
    remind_before_minutes: 10,
    ...overrides,
});

const WEEK = [
    block({ day_of_week: 'mon', label: 'IOE' }),
    block({ day_of_week: 'mon', label: 'IRS', start_time: '10:20:00', end_time: '11:15:00' }),
    block({ day_of_week: 'tue', label: 'CSL' }),
];

const renderList = (blocks = WEEK, quietDays: ScheduleBlock['day_of_week'][] = []) =>
    render(
        <ScheduleList
            blocks={blocks}
            onAddBlock={vi.fn()}
            onEditBlock={vi.fn()}
            onDeleteBlock={vi.fn()}
            quietDays={quietDays}
        />,
    );

const dayToggle = (day: string) => screen.getByRole('button', { name: new RegExp(`^${day}`) });

describe('ScheduleList — one day at a time', () => {
    beforeEach(() => {
        // A Monday, so "today" is predictable.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-28T10:00:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('opens today and keeps the rest of the week folded', () => {
        renderList();

        expect(dayToggle('Monday')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('IOE')).toBeVisible();
        expect(dayToggle('Tuesday')).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('CSL')).not.toBeVisible();
    });

    it('says how full a folded day is', () => {
        renderList();

        expect(dayToggle('Monday')).toHaveTextContent('2 blocks');
        expect(dayToggle('Tuesday')).toHaveTextContent('1 block');
        expect(dayToggle('Wednesday')).toHaveTextContent('free');
    });

    it('unfolds and folds a day on click', async () => {
        renderList();

        await userEvent.click(dayToggle('Tuesday'));
        expect(dayToggle('Tuesday')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText('CSL')).toBeVisible();

        await userEvent.click(dayToggle('Tuesday'));
        expect(screen.getByText('CSL')).not.toBeVisible();
    });

    it('opens a folded day when something is added to it', async () => {
        renderList();

        const wednesday = dayToggle('Wednesday').closest('div.border') as HTMLElement;
        const addButton = Array.from(wednesday.querySelectorAll('button')).find(
            (b) => b.textContent === 'Add block',
        ) as HTMLButtonElement;
        await userEvent.click(addButton);

        expect(dayToggle('Wednesday')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByLabelText('Start Time')).toBeVisible();
    });

    it('offers only timed blocks — whole days live in Quiet days now', () => {
        renderList();

        expect(screen.queryByRole('button', { name: 'Mark whole day' })).not.toBeInTheDocument();
    });

    it('marks a quiet weekday on its header', () => {
        renderList(WEEK, ['sat']);

        expect(dayToggle('Saturday')).toHaveTextContent('quiet');
        expect(dayToggle('Monday')).not.toHaveTextContent('quiet');
    });
});
