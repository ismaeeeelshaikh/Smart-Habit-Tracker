import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderForm } from '../reminders/ReminderForm';

describe('ReminderForm', () => {
    beforeEach(() => {
        // 5:40 PM local, so 9 PM tonight is still ahead.
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 27, 17, 40));
    });
    afterEach(() => vi.useRealTimers());

    it('asks only what, when and how often', () => {
        render(<ReminderForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByText(/One-off/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /hour|Tonight|Tomorrow/ })).not.toBeInTheDocument();
    });

    it('opens on the next full hour, shown in AM / PM', () => {
        render(<ReminderForm onSubmit={vi.fn()} onCancel={vi.fn()} />);

        // 5:40 PM now, so 6:00 PM.
        expect(screen.getByLabelText('Date')).toHaveValue('2026-09-27');
        expect(screen.getByLabelText('Time')).toHaveTextContent('6:00 PM');
    });

    it('saves a repeating reminder with its label and rule', async () => {
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        render(<ReminderForm onSubmit={onSubmit} onCancel={vi.fn()} />);

        await userEvent.type(screen.getByLabelText('Remind me to'), 'Pay the fee');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-27' } });
        await userEvent.click(screen.getByLabelText('Time'));
        await userEvent.click(within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '9' }));
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));
        await userEvent.click(screen.getByRole('radio', { name: 'Weekdays' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(onSubmit).toHaveBeenCalledWith({
            goal_id: null,
            label: 'Pay the fee',
            scheduled_time: '2026-09-27T21:00',
            recurrence_rule: 'weekdays',
        });
    });
});
