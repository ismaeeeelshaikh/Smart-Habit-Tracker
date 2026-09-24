import React, { useState } from 'react';
import { createScheduleBlocks, draftScheduleBlocks } from '../../api';
import type { ScheduleBlockCreate, ScheduleDraftBlock } from '../../types';
import { formatTimeRange } from '../../utils/time';
import { Button } from '../ui/Button';

/** Matches the form's default: a block nobody thought about still warns in time. */
const DEFAULT_REMIND_BEFORE = 10;

const DAY_LABELS: Record<string, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

const EXAMPLE = 'Mon to Fri college 9am to 3pm, gym Tuesday and Thursday 6 to 7pm, cricket Sunday morning 7 to 9';

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

    const read = async () => {
        setError(null);
        setIsReading(true);
        try {
            const result = await draftScheduleBlocks(text);
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
                remind_before_minutes: DEFAULT_REMIND_BEFORE,
            }));
            await createScheduleBlocks(blocks);
            await onSaved();
            setDraft(null);
            setSkipped([]);
            setText('');
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
                    Write it the way you'd say it. You'll see what it understood before anything is saved.
                </p>
            </div>

            <textarea
                aria-label="Describe your week"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={EXAMPLE}
                rows={3}
                maxLength={4000}
                className="w-full rounded-[8px] border border-[var(--color-border)] bg-white px-3 py-2 text-[15px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-free)]"
            />

            <div className="flex justify-end">
                <Button onClick={read} disabled={isReading || !text.trim()}>
                    {isReading ? 'Reading…' : 'Read this'}
                </Button>
            </div>

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
                                        <span className="text-sm">
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

                    <div className="flex gap-2 justify-end">
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
