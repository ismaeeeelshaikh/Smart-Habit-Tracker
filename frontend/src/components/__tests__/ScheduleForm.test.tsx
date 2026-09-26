import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScheduleForm } from '../schedule/ScheduleForm';

const noop = () => {};

const saved = (onSubmit: ReturnType<typeof vi.fn>) => onSubmit.mock.calls[0][0];

describe('ScheduleForm — a timed block', () => {
    it('warns ten minutes before by default, so a new block is never silent', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ScheduleForm dayOfWeek="mon" onSubmit={onSubmit} onCancel={noop} />);

        await userEvent.type(screen.getByLabelText(/Label/), 'DSL Lab');
        await userEvent.type(screen.getByLabelText('Start Time'), '09:00');
        await userEvent.type(screen.getByLabelText('End Time'), '11:00');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(saved(onSubmit)).toMatchObject({
            day_of_week: 'mon',
            label: 'DSL Lab',
            is_flexible_block: false,
            start_time: '09:00:00',
            end_time: '11:00:00',
            remind_before_minutes: 10,
        });
    });

    it('lets the warning be turned off', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ScheduleForm dayOfWeek="tue" onSubmit={onSubmit} onCancel={noop} />);

        await userEvent.type(screen.getByLabelText(/Label/), 'Gym');
        await userEvent.type(screen.getByLabelText('Start Time'), '18:00');
        await userEvent.type(screen.getByLabelText('End Time'), '19:00');
        await userEvent.click(screen.getByRole('checkbox', { name: 'Remind me' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(saved(onSubmit).remind_before_minutes).toBeNull();
    });

    it('keeps the lead time an existing block was saved with', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(
            <ScheduleForm
                dayOfWeek="wed"
                initialData={{
                    label: 'AI-ML',
                    start_time: '14:00:00',
                    end_time: '16:00:00',
                    is_flexible_block: false,
                    remind_before_minutes: 30,
                }}
                onSubmit={onSubmit}
                onCancel={noop}
            />,
        );

        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(saved(onSubmit).remind_before_minutes).toBe(30);
    });

    it('accepts 0 as a reminder right as it starts', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ScheduleForm dayOfWeek="thu" onSubmit={onSubmit} onCancel={noop} />);

        await userEvent.type(screen.getByLabelText(/Label/), 'IRS');
        await userEvent.type(screen.getByLabelText('Start Time'), '09:05');
        await userEvent.type(screen.getByLabelText('End Time'), '10:00');
        await userEvent.clear(screen.getByLabelText('Minutes before it starts'));
        await userEvent.type(screen.getByLabelText('Minutes before it starts'), '0');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(saved(onSubmit).remind_before_minutes).toBe(0);
    });

    it('refuses to save a blank lead time while the reminder is on', async () => {
        /* Out-of-range numbers are caught by the field's own min/max — the
           browser refuses the submit. An empty field is the one the browser
           allows through, so it is the one this has to catch. */
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ScheduleForm dayOfWeek="thu" onSubmit={onSubmit} onCancel={noop} />);

        await userEvent.type(screen.getByLabelText(/Label/), 'Lecture');
        await userEvent.type(screen.getByLabelText('Start Time'), '09:00');
        await userEvent.type(screen.getByLabelText('End Time'), '10:00');
        await userEvent.clear(screen.getByLabelText('Minutes before it starts'));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(await screen.findByText(/between 0 and 240 minutes/)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not ask about the whole day here any more', () => {
        render(<ScheduleForm dayOfWeek="fri" onSubmit={vi.fn()} onCancel={noop} />);

        expect(screen.queryByText(/Flexible/)).not.toBeInTheDocument();
        expect(screen.queryByText('On this day I\'m')).not.toBeInTheDocument();
    });
});

describe('ScheduleForm — marking a whole day', () => {
    it('saves a day with no clock and no reminder', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ScheduleForm dayOfWeek="sun" mode="day" onSubmit={onSubmit} onCancel={noop} />);

        expect(screen.queryByLabelText('Start Time')).not.toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Remind me' })).not.toBeInTheDocument();

        await userEvent.type(screen.getByLabelText(/What is this day/), 'Diwali');
        await userEvent.click(screen.getByRole('radio', { name: /Mostly free/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(saved(onSubmit)).toMatchObject({
            day_of_week: 'sun',
            label: 'Diwali',
            is_flexible_block: true,
            flexible_availability: 'free',
            start_time: null,
            end_time: null,
            remind_before_minutes: null,
        });
    });

    it('opens an existing whole-day entry as one, whatever it was opened from', () => {
        render(
            <ScheduleForm
                dayOfWeek="sat"
                initialData={{
                    label: 'Family',
                    is_flexible_block: true,
                    flexible_availability: 'busy',
                }}
                onSubmit={vi.fn()}
                onCancel={noop}
            />,
        );

        expect(screen.getByRole('radio', { name: /Committed/ })).toBeChecked();
        expect(screen.queryByLabelText('Start Time')).not.toBeInTheDocument();
    });
});
