import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DescribeWeek } from '../schedule/DescribeWeek';
import { mockFetch } from '../../test/utils';

const DESCRIPTION = 'Mon college 9 to 3';

const draftRoute = (body: unknown, status = 200) => ({ '/api/schedule/draft': { status, body } });

const oneBlock = {
    blocks: [{ day_of_week: 'mon', label: 'College', start_time: '09:00:00', end_time: '15:00:00' }],
    skipped: [],
};

const describeWeek = async (text = DESCRIPTION) => {
    await userEvent.type(screen.getByLabelText('Describe your week'), text);
    await userEvent.click(screen.getByRole('button', { name: 'Read this' }));
};

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, urlPart: string) => {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(urlPart));
    return JSON.parse((call?.[1] as RequestInit).body as string);
};

describe('DescribeWeek', () => {
    beforeEach(() => vi.unstubAllGlobals());

    it('shows what it understood and saves nothing until told to', async () => {
        const fetchMock = mockFetch(draftRoute(oneBlock));
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek();

        expect(await screen.findByText('College')).toBeInTheDocument();
        expect(screen.getByText(/Monday/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save 1 block' })).toBeInTheDocument();
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/schedule/bulk'))).toBe(false);
    });

    it('saves the reviewed blocks with a reminder already set', async () => {
        const fetchMock = mockFetch({ ...draftRoute(oneBlock), '/api/schedule/bulk': { status: 201, body: [] } });
        const onSaved = vi.fn();
        render(<DescribeWeek onSaved={onSaved} />);

        await describeWeek();
        await userEvent.click(await screen.findByRole('button', { name: 'Save 1 block' }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(bodyOf(fetchMock, '/api/schedule/bulk')).toEqual({
            blocks: [
                {
                    day_of_week: 'mon',
                    label: 'College',
                    is_flexible_block: false,
                    start_time: '09:00:00',
                    end_time: '15:00:00',
                    remind_before_minutes: 10,
                },
            ],
        });
    });

    it('lets a misread block be removed before saving', async () => {
        const fetchMock = mockFetch({
            '/api/schedule/draft': {
                body: {
                    blocks: [
                        ...oneBlock.blocks,
                        { day_of_week: 'tue', label: 'Gym', start_time: '18:00:00', end_time: '19:00:00' },
                    ],
                    skipped: [],
                },
            },
            '/api/schedule/bulk': { status: 201, body: [] },
        });
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek();
        await userEvent.click(await screen.findByRole('button', { name: 'Remove Gym' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save 1 block' }));

        await waitFor(() =>
            expect(bodyOf(fetchMock, '/api/schedule/bulk').blocks.map((b: { label: string }) => b.label)).toEqual([
                'College',
            ]),
        );
    });

    it('shows what it had to drop', async () => {
        mockFetch(draftRoute({ blocks: oneBlock.blocks, skipped: ["Skipped Gym: I couldn't read the times."] }));
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek();

        expect(await screen.findByText(/Skipped Gym/)).toBeInTheDocument();
    });

    it('says so when the model is unavailable, and points at the form', async () => {
        mockFetch(draftRoute({ detail: 'The model is busy right now. Try again in a minute.' }, 503));
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek();

        expect(await screen.findByText(/The model is busy right now/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
    });

    it('says when it found nothing usable', async () => {
        mockFetch(draftRoute({ blocks: [], skipped: ["I couldn't find any commitments in that."] }));
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek('hello');

        expect(await screen.findByText(/Nothing usable in that/)).toBeInTheDocument();
    });

    it('will not ask the model about an empty description', () => {
        mockFetch(draftRoute(oneBlock));
        render(<DescribeWeek onSaved={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'Read this' })).toBeDisabled();
    });
});
