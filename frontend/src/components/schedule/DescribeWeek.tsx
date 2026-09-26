import React, { useState } from 'react';
import { FileUp, Mic, Square } from 'lucide-react';
import { createScheduleBlocks, draftScheduleBlocks, draftScheduleFromPdf } from '../../api';
import { isVoiceSupported, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import type { ScheduleBlockCreate, ScheduleDraftBlock } from '../../types';
import { formatTimeRange } from '../../utils/time';
import { Button } from '../ui/Button';

/** How much warning the saved blocks get. Chosen once for the whole batch:
 * a college timetable might want "on time", a routine "10 minutes before". */
const REMINDER_CHOICES = [
    { value: '10', label: '10 min before' },
    { value: '0', label: 'On time' },
    { value: 'none', label: 'No reminder' },
] as const;

const DAY_LABELS: Record<string, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

const EXAMPLE = 'Mon to Fri college 9am to 3pm, gym Tuesday and Thursday 6 to 7pm, cricket Sunday morning 7 to 9…';

interface DescribeWeekProps {
    /** Called after blocks are saved, so the week below reloads. */
    onSaved: () => Promise<unknown> | unknown;
}

export const DescribeWeek: React.FC<DescribeWeekProps> = ({ onSaved }) => {
    const [text, setText] = useState('');
    const [draft, setDraft] = useState<ScheduleDraftBlock[] | null>(null);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isReading, setIsReading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [reminder, setReminder] = useState<string>('10');
    const [pdf, setPdf] = useState<File | null>(null);
    const [choices, setChoices] = useState('');

    // Spoken words land in the box, after whatever was typed, for checking.
    const voice = useVoiceRecorder((heard) =>
        setText((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard)),
    );
    const canUseVoice = isVoiceSupported();

    const preview = async (fetchDraft: () => Promise<{ blocks: ScheduleDraftBlock[]; skipped: string[] }>) => {
        setError(null);
        setIsReading(true);
        try {
            const result = await fetchDraft();
            setDraft(result.blocks);
            setSkipped(result.skipped);
        } catch (err) {
            // The form below still works, so say what happened and stay out of the way.
            setError(err instanceof Error ? err.message : "Couldn't read that.");
            setDraft(null);
        } finally {
            setIsReading(false);
        }
    };

    const read = () => preview(() => draftScheduleBlocks(text));
    const readPdf = () => {
        if (pdf) preview(() => draftScheduleFromPdf(pdf, choices));
    };

    const save = async () => {
        if (!draft?.length) return;
        setError(null);
        setIsSaving(true);
        try {
            const blocks: ScheduleBlockCreate[] = draft.map((block) => ({
                day_of_week: block.day_of_week,
                label: block.label,
                is_flexible_block: false,
                start_time: block.start_time,
                end_time: block.end_time,
                remind_before_minutes: reminder === 'none' ? null : Number(reminder),
            }));
            await createScheduleBlocks(blocks);
            await onSaved();
            setDraft(null);
            setSkipped([]);
            setText('');
            setPdf(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't save those blocks.");
        } finally {
            setIsSaving(false);
        }
    };

    const discard = (index: number) =>
        setDraft((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));

    return (
        <section className="border border-border rounded-lg bg-card p-4 flex flex-col gap-3">
            <div>
                <h2 className="font-semibold text-lg">Describe your week</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Type it or say it, the way you'd tell a friend. You'll see what it understood before
                    anything is saved.
                </p>
            </div>

            <textarea
                aria-label="Describe your week"
                name="week-description"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                rows={3}
                maxLength={4000}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-white px-3 py-2 text-[15px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
                {canUseVoice && (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={voice.state === 'recording' ? voice.stop : voice.start}
                        disabled={voice.state === 'transcribing' || isReading}
                        aria-pressed={voice.state === 'recording'}
                        className="inline-flex items-center gap-2"
                    >
                        {voice.state === 'recording' ? (
                            <>
                                <Square aria-hidden="true" className="h-4 w-4 text-[var(--color-error)]" />
                                Stop · {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}
                            </>
                        ) : voice.state === 'transcribing' ? (
                            'Writing it down…'
                        ) : (
                            <>
                                <Mic aria-hidden="true" className="h-4 w-4" />
                                Speak
                            </>
                        )}
                    </Button>
                )}
                <Button onClick={read} disabled={isReading || !text.trim() || voice.state !== 'idle'}>
                    {isReading && !pdf ? 'Previewing…' : 'Preview schedule'}
                </Button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
                <p className="text-sm font-medium">Have your college timetable as a PDF?</p>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:border-[var(--color-free)] focus-within:ring-[3px] focus-within:ring-[var(--color-free-tint)]">
                        <FileUp aria-hidden="true" className="h-4 w-4" />
                        <span className="min-w-0 truncate max-w-[14rem]">{pdf ? pdf.name : 'Choose PDF'}</span>
                        <input
                            type="file"
                            accept="application/pdf,.pdf"
                            aria-label="Timetable PDF"
                            className="sr-only"
                            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                        />
                    </label>
                    <input
                        aria-label="Your batch and electives"
                        name="timetable-choices"
                        autoComplete="off"
                        value={choices}
                        onChange={(e) => setChoices(e.target.value)}
                        placeholder="Your batch and electives, e.g. C1, CSL, AI-ML, IS…"
                        maxLength={500}
                        className="flex-1 min-w-[12rem] h-10 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
                    />
                    <Button
                        variant="secondary"
                        onClick={readPdf}
                        disabled={isReading || !pdf || !choices.trim()}
                    >
                        {isReading && pdf ? 'Previewing…' : 'Preview timetable'}
                    </Button>
                </div>
                <p className="text-[13px] text-muted-foreground">
                    Timetables list every batch's lab in one cell, so say which batch and electives are yours.
                </p>
            </div>

            <div aria-live="polite" className="sr-only">
                {voice.state === 'recording' ? 'Recording. Press stop when you are done.' : ''}
            </div>

            {voice.error && <p className="text-sm text-destructive font-medium">{voice.error}</p>}
            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            {draft && (
                <div className="flex flex-col gap-3 border-t border-border pt-3">
                    {draft.length > 0 ? (
                        <>
                            <p className="text-sm font-medium">
                                Found {draft.length} {draft.length === 1 ? 'block' : 'blocks'}. Remove anything wrong,
                                then save.
                            </p>
                            <ul className="flex flex-col gap-2">
                                {draft.map((block, index) => (
                                    <li
                                        key={`${block.day_of_week}-${block.start_time}-${block.label}`}
                                        className="flex items-center justify-between gap-3 p-2 rounded-md border border-border bg-background"
                                    >
                                        <span className="text-sm min-w-0 break-words">
                                            <span className="font-medium">{block.label}</span>
                                            <span className="text-muted-foreground">
                                                {' · '}
                                                {DAY_LABELS[block.day_of_week] ?? block.day_of_week}
                                                {' · '}
                                                {formatTimeRange(block.start_time, block.end_time)}
                                            </span>
                                        </span>
                                        <Button
                                            variant="secondary"
                                            className="text-sm px-3 py-1.5 h-auto"
                                            onClick={() => discard(index)}
                                            aria-label={`Remove ${block.label}`}
                                        >
                                            Remove
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Nothing usable in that. Try naming days and times, or add blocks below.
                        </p>
                    )}

                    {skipped.length > 0 && (
                        <ul className="text-sm text-muted-foreground list-disc pl-5">
                            {skipped.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    )}

                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        {draft.length > 0 && (
                            <label className="flex items-center gap-2 text-sm mr-auto">
                                Remind me
                                <select
                                    value={reminder}
                                    onChange={(e) => setReminder(e.target.value)}
                                    className="h-9 rounded-md border border-[var(--color-border)] bg-white px-2 text-sm text-[var(--color-ink)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
                                >
                                    {REMINDER_CHOICES.map((choice) => (
                                        <option key={choice.value} value={choice.value}>
                                            {choice.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setDraft(null);
                                setSkipped([]);
                            }}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={isSaving || draft.length === 0}>
                            {isSaving
                                ? 'Saving…'
                                : `Save ${draft.length} ${draft.length === 1 ? 'block' : 'blocks'}`}
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
};
