import { act, render, screen, waitFor } from '@testing-library/react';
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
    await userEvent.click(screen.getByRole('button', { name: 'Preview schedule' }));
};

const bodyOf = (fetchMock: ReturnType<typeof mockFetch>, urlPart: string) => {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(urlPart));
    if (!call) throw new Error(`no request to ${urlPart}`);
    return JSON.parse((call[1] as RequestInit).body as string);
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

        expect(screen.getByRole('button', { name: 'Preview schedule' })).toBeDisabled();
    });

    it.each([
        ['On time', 0],
        ['No reminder', null],
    ])('saves the whole batch with the chosen reminder: %s', async (choice, expected) => {
        const fetchMock = mockFetch({ ...draftRoute(oneBlock), '/api/schedule/bulk': { status: 201, body: [] } });
        render(<DescribeWeek onSaved={vi.fn()} />);

        await describeWeek();
        await userEvent.selectOptions(await screen.findByLabelText('Remind me'), choice);
        await userEvent.click(screen.getByRole('button', { name: 'Save 1 block' }));

        await waitFor(() =>
            expect(bodyOf(fetchMock, '/api/schedule/bulk').blocks[0].remind_before_minutes).toBe(expected),
        );
    });
});

describe('DescribeWeek — speaking instead of typing', () => {
    class FakeRecorder {
        static latest: FakeRecorder;
        state: 'inactive' | 'recording' = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        constructor() {
            FakeRecorder.latest = this;
        }
        start() {
            this.state = 'recording';
        }
        stop() {
            this.state = 'inactive';
            this.ondataavailable?.({ data: new Blob(['sound'], { type: 'audio/webm' }) });
            this.onstop?.();
        }
    }

    const stopTrack = vi.fn();

    const installMicrophone = (getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })) => {
        vi.stubGlobal('MediaRecorder', FakeRecorder);
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        return getUserMedia;
    };

    beforeEach(() => {
        vi.unstubAllGlobals();
        stopTrack.mockClear();
    });

    it('puts what was heard into the box for checking, and sends nothing else', async () => {
        const fetchMock = mockFetch({ '/api/schedule/transcribe': { body: { text: 'Monday college 9 to 3' } } });
        installMicrophone();
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
        expect(await screen.findByRole('button', { name: /Stop/ })).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /Stop/ }));

        await waitFor(() =>
            expect(screen.getByLabelText('Describe your week')).toHaveValue('Monday college 9 to 3'),
        );
        expect(stopTrack).toHaveBeenCalled();
        // Heard words wait for the user: nothing is drafted until they ask.
        expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/schedule/draft'))).toBe(false);
        const upload = fetchMock.mock.calls.find(([url]) => String(url).includes('/transcribe'));
        expect(upload).toBeDefined();
        expect((upload![1] as RequestInit).body).toBeInstanceOf(FormData);
    });

    it('adds to what was already typed rather than replacing it', async () => {
        mockFetch({ '/api/schedule/transcribe': { body: { text: 'gym Tuesday 6 to 7' } } });
        installMicrophone();
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.type(screen.getByLabelText('Describe your week'), 'Monday college 9 to 3');
        await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
        await userEvent.click(await screen.findByRole('button', { name: /Stop/ }));

        await waitFor(() =>
            expect(screen.getByLabelText('Describe your week')).toHaveValue(
                'Monday college 9 to 3 gym Tuesday 6 to 7',
            ),
        );
    });

    it('explains a blocked microphone instead of failing quietly', async () => {
        mockFetch({});
        installMicrophone(vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')));
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Speak' }));

        expect(await screen.findByText(/Microphone access is blocked/)).toBeInTheDocument();
    });

    it('says so when the voice service is down', async () => {
        mockFetch({ '/api/schedule/transcribe': { status: 503, body: { detail: 'The model is busy right now.' } } });
        installMicrophone();
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
        await act(async () => FakeRecorder.latest.stop());

        expect(await screen.findByText('The model is busy right now.')).toBeInTheDocument();
    });

    it('hides the button where the browser cannot record', () => {
        mockFetch({});
        vi.stubGlobal('MediaRecorder', undefined);
        render(<DescribeWeek onSaved={vi.fn()} />);

        expect(screen.queryByRole('button', { name: 'Speak' })).not.toBeInTheDocument();
    });
});

describe('DescribeWeek — a timetable PDF', () => {
    beforeEach(() => vi.unstubAllGlobals());

    const timetable = () => new File(['%PDF-1.7'], 'timetable.pdf', { type: 'application/pdf' });

    it('waits for a file before it will preview', async () => {
        mockFetch({});
        render(<DescribeWeek onSaved={vi.fn()} />);
        const button = screen.getByRole('button', { name: 'Preview timetable' });

        expect(button).toBeDisabled();
        await userEvent.upload(screen.getByLabelText('Timetable PDF'), timetable());
        expect(button).toBeEnabled();
        expect(screen.getByText('timetable.pdf')).toBeInTheDocument();
    });

    it('sends the file and shows every option for the user to prune', async () => {
        const fetchMock = mockFetch({
            '/api/schedule/draft-pdf': {
                body: {
                    blocks: [
                        { day_of_week: 'mon', label: 'DSL / IOE / ROSPL lab', start_time: '12:50:00', end_time: '14:40:00' },
                        { day_of_week: 'tue', label: 'STQA', start_time: '13:45:00', end_time: '14:40:00' },
                    ],
                    skipped: [],
                },
            },
            '/api/schedule/bulk': { status: 201, body: [] },
        });
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.upload(screen.getByLabelText('Timetable PDF'), timetable());
        await userEvent.click(screen.getByRole('button', { name: 'Preview timetable' }));

        expect(await screen.findByText('DSL / IOE / ROSPL lab')).toBeInTheDocument();
        const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/schedule/draft-pdf'));
        expect(call).toBeDefined();
        expect(((call![1] as RequestInit).body as FormData).get('file')).toBeInstanceOf(File);

        // An elective that isn't theirs goes before saving.
        await userEvent.click(screen.getByRole('button', { name: 'Remove STQA' }));
        await userEvent.click(screen.getByRole('button', { name: 'Save 1 block' }));
        await waitFor(() =>
            expect(bodyOf(fetchMock, '/api/schedule/bulk').blocks.map((b: { label: string }) => b.label)).toEqual([
                'DSL / IOE / ROSPL lab',
            ]),
        );
    });

    it('explains a PDF it could not read', async () => {
        mockFetch({
            '/api/schedule/draft-pdf': {
                status: 422,
                body: { detail: "I couldn't find a timetable grid in that PDF." },
            },
        });
        render(<DescribeWeek onSaved={vi.fn()} />);

        await userEvent.upload(screen.getByLabelText('Timetable PDF'), timetable());
        await userEvent.click(screen.getByRole('button', { name: 'Preview timetable' }));

        expect(await screen.findByText(/couldn't find a timetable grid/)).toBeInTheDocument();
    });
});
