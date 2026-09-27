import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatTime } from '../../utils/time';

interface TimePickerProps {
    id: string;
    /** 24-hour "HH:MM", which is what the API speaks. */
    value: string;
    onChange: (value: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_STEP = 5;

const split = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, pm: h >= 12 };
};

const join = (hour12: number, minute: number, pm: boolean) => {
    const h = (hour12 % 12) + (pm ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const cell = (selected: boolean) =>
    cn(
        'h-10 w-full shrink-0 rounded-[8px] font-mono text-[15px] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]',
        selected
            ? 'bg-[var(--color-free)] text-[var(--color-on-free)] font-semibold'
            : 'text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]',
    );

/**
 * A 12-hour time picker: hour, minute and AM / PM columns, like a phone's.
 * A native <input type="time"> follows the browser's locale and shows
 * 24-hour time on many phones, which this app never uses.
 */
export const TimePicker = ({ id, value, onChange }: TimePickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const { hour12, minute, pm } = split(value);

    // A saved minute off the 5-minute grid (e.g. 23:59) stays selectable.
    const grid = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
    const minutes = grid.includes(minute) ? grid : [...grid, minute].sort((a, b) => a - b);

    useEffect(() => {
        if (!isOpen) return;
        // Bring each column's current choice into view, scrolling the column
        // only — scrollIntoView would also move the page.
        rootRef.current?.querySelectorAll<HTMLElement>('[role="listbox"]').forEach((list) => {
            const chosen = list.querySelector<HTMLElement>('[aria-selected="true"]');
            if (chosen) list.scrollTop = chosen.offsetTop - list.clientHeight / 2 + chosen.clientHeight / 2;
        });

        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !rootRef.current?.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [isOpen]);

    const column = (label: string, children: ReactNode) => (
        <div role="listbox" aria-label={label} className="relative flex max-h-[200px] flex-col gap-1 overflow-y-auto p-1 [scrollbar-width:thin]">
            {children}
        </div>
    );

    return (
        <div ref={rootRef} className="relative">
            <button
                id={id}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
                className={cn(
                    'flex h-11 w-full items-center justify-between rounded-[10px] border bg-[var(--color-bg)] px-3 font-mono text-[15px] text-[var(--color-ink)] touch-manipulation focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]',
                    isOpen ? 'border-[var(--color-free)]' : 'border-[var(--color-border)]',
                )}
            >
                {formatTime(value)}
                <Clock aria-hidden="true" className="h-4 w-4 text-[var(--color-ink-muted)]" />
            </button>

            {isOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 min-w-[200px] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.3)]">
                    <div className="grid grid-cols-3 gap-1">
                        {column(
                            'Hour',
                            HOURS.map((h) => (
                                <button
                                    key={h}
                                    type="button"
                                    role="option"
                                    aria-selected={h === hour12}
                                    onClick={() => onChange(join(h, minute, pm))}
                                    className={cell(h === hour12)}
                                >
                                    {h}
                                </button>
                            )),
                        )}
                        {column(
                            'Minute',
                            minutes.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    role="option"
                                    aria-selected={m === minute}
                                    onClick={() => onChange(join(hour12, m, pm))}
                                    className={cell(m === minute)}
                                >
                                    {String(m).padStart(2, '0')}
                                </button>
                            )),
                        )}
                        {column(
                            'AM or PM',
                            [false, true].map((isPm) => (
                                <button
                                    key={String(isPm)}
                                    type="button"
                                    role="option"
                                    aria-selected={isPm === pm}
                                    onClick={() => onChange(join(hour12, minute, isPm))}
                                    className={cell(isPm === pm)}
                                >
                                    {isPm ? 'PM' : 'AM'}
                                </button>
                            )),
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="mt-1 h-10 w-full rounded-[8px] font-inter text-[14px] font-semibold text-[var(--color-free)] hover:bg-[var(--color-free-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                    >
                        Done
                    </button>
                </div>
            )}
        </div>
    );
};
