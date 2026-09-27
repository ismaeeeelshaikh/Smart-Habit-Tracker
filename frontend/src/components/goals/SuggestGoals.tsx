import React, { useState } from 'react';
import { Check, Mic, Plus, Sparkles, Square } from 'lucide-react';
import { suggestGoals } from '../../api';
import { isVoiceSupported, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import type { GoalCreate, GoalSuggestion } from '../../types';
import { formatDuration } from '../../utils/time';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface SuggestGoalsProps {
    /** The ordinary create call — a suggestion becomes a goal only when added. */
    onAdd: (data: GoalCreate) => Promise<unknown>;
}

/**
 * "What should I build?" for someone who doesn't know yet. It proposes a few
 * habits sized to the free time their week really has; each is one tap to add
 * and nothing is saved otherwise.
 */
export const SuggestGoals: React.FC<SuggestGoalsProps> = ({ onAdd }) => {
    const [about, setAbout] = useState('');
    const [suggestions, setSuggestions] = useState<GoalSuggestion[] | null>(null);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [added, setAdded] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [isAsking, setIsAsking] = useState(false);
    const [addingName, setAddingName] = useState<string | null>(null);

    const voice = useVoiceRecorder((heard) =>
        setAbout((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard)),
    );
    const canUseVoice = isVoiceSupported();

    const ask = async () => {
        setError(null);
        setIsAsking(true);
        try {
            const result = await suggestGoals(about);
            setSuggestions(result.suggestions);
            setSkipped(result.skipped);
            setAdded(new Set());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't get suggestions right now.");
            setSuggestions(null);
        } finally {
            setIsAsking(false);
        }
    };

    const add = async (suggestion: GoalSuggestion) => {
        setError(null);
        setAddingName(suggestion.name);
        try {
            await onAdd({
                name: suggestion.name,
                priority: suggestion.priority,
                estimated_duration_minutes: suggestion.estimated_duration_minutes,
            });
            setAdded((prev) => new Set(prev).add(suggestion.name));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't add that goal.");
        } finally {
            setAddingName(null);
        }
    };

    return (
        <section className="border border-[var(--color-border)] rounded-[16px] bg-[var(--color-surface)] p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-free-tint)] text-[var(--color-free)]">
                    <Sparkles className="h-4 w-4" />
                </span>
                <div>
                    <h2 className="font-display font-semibold text-[17px] leading-tight text-[var(--color-ink)]">
                        Not sure what to work on?
                    </h2>
                    <p className="text-[13px] text-[var(--color-ink-muted)] mt-1 leading-snug">
                        Get a few habits sized to the free time your week really has. Add the ones you like.
                    </p>
                </div>
            </div>

            <textarea
                aria-label="About you (optional)"
                name="about-you"
                autoComplete="off"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="Optional: a little about you — busy job, want to read more, stay fit…"
                rows={2}
                maxLength={500}
                className="w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-[15px] leading-relaxed text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]"
            />

            <div className="flex flex-wrap items-center gap-2">
                {canUseVoice && (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={voice.state === 'recording' ? voice.stop : voice.start}
                        disabled={voice.state === 'transcribing' || isAsking}
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
                <Button className="flex-1" onClick={ask} disabled={isAsking || voice.state !== 'idle'}>
                    {isAsking ? 'Thinking…' : 'Suggest goals'}
                </Button>
            </div>

            {voice.error && <p className="text-sm text-destructive font-medium">{voice.error}</p>}
            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            {suggestions && (
                <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3" aria-live="polite">
                    {suggestions.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                            {suggestions.map((s) => {
                                const isAdded = added.has(s.name);
                                return (
                                    <li
                                        key={s.name}
                                        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-[12px] bg-[var(--color-surface-soft)]"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-semibold text-[var(--color-ink)] break-words">
                                                {s.name}
                                                <Badge priority={s.priority} />
                                                <span className="font-mono text-[12px] font-normal text-[var(--color-ink-muted)]">
                                                    {formatDuration(s.estimated_duration_minutes)}
                                                </span>
                                            </p>
                                            {s.reason && (
                                                <p className="text-sm text-muted-foreground mt-0.5 break-words">
                                                    {s.reason}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => add(s)}
                                            disabled={isAdded || addingName !== null}
                                            aria-label={isAdded ? `${s.name} added` : `Add ${s.name}`}
                                            className={`inline-flex min-h-[40px] items-center gap-1 rounded-full border border-[var(--color-free)] px-3.5 font-inter text-[13px] font-semibold touch-manipulation transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)] focus-visible:ring-offset-2 ${
                                                isAdded
                                                    ? 'bg-[var(--color-free)] text-[var(--color-on-free)]'
                                                    : 'bg-[var(--color-surface)] text-[var(--color-free)] hover:bg-[var(--color-free-tint)] disabled:opacity-60'
                                            }`}
                                        >
                                            {isAdded ? (
                                                <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                                            ) : (
                                                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                                            )}
                                            {isAdded ? 'Added' : addingName === s.name ? 'Adding…' : 'Add'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Nothing to suggest right now. Try telling it a little about yourself.
                        </p>
                    )}

                    {skipped.length > 0 && (
                        <ul className="text-sm text-muted-foreground list-disc pl-5">
                            {skipped.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
};
