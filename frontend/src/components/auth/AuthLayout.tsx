import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Clock, Eye, EyeOff } from 'lucide-react';

export const authInput =
    'block w-full h-12 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] transition-colors focus-visible:outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)]';

export const authLabel = 'block text-[13px] font-medium text-[var(--color-ink)] mb-1.5';

/** A password field with a show / hide toggle, so a typo can be caught on a phone. */
export const PasswordInput = (props: InputHTMLAttributes<HTMLInputElement>) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input {...props} type={visible ? 'text' : 'password'} className={`${authInput} pr-12`} />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                className="absolute inset-y-0 right-1 my-auto grid h-10 w-10 place-items-center rounded-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
            >
                {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
            </button>
        </div>
    );
};

/** A day at a glance, drawn the way the app draws it: busy solid, free open. */
const MiniDay = () => {
    const segments: { kind: 'busy' | 'free'; grow: number; label?: string }[] = [
        { kind: 'free', grow: 3, label: '3h' },
        { kind: 'busy', grow: 4, label: 'Work' },
        { kind: 'free', grow: 1 },
        { kind: 'busy', grow: 2, label: 'Meeting' },
        { kind: 'free', grow: 4, label: '4h' },
        { kind: 'busy', grow: 0.6 },
        { kind: 'free', grow: 2.5, label: '2h 30m' },
    ];
    return (
        <div aria-hidden="true" className="rounded-[18px] bg-white/10 p-4 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">Today</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-1 font-mono text-[11px] text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#9FE3B8]" />
                    Free now · 2h 20m
                </span>
            </div>
            <div className="mt-3 flex h-12 gap-1">
                {segments.map((s, i) => (
                    <span
                        key={i}
                        style={{ flexGrow: s.grow }}
                        className={
                            s.kind === 'busy'
                                ? 'grid basis-0 place-items-center overflow-hidden rounded-[7px] bg-white/90 px-1 text-[11px] font-medium text-[var(--color-hero-to)]'
                                : 'grid basis-0 place-items-center overflow-hidden rounded-[7px] bg-white/10 px-1 font-mono text-[11px] text-white ring-1 ring-inset ring-white/40'
                        }
                    >
                        <span className="truncate">{s.label}</span>
                    </span>
                ))}
            </div>
            <p className="mt-3 text-[13px] text-white/80">
                Suggested: <span className="font-medium text-white">Reading — today: Chapter 3</span>
            </p>
        </div>
    );
};

const Wordmark = () => (
    <span className="inline-flex items-center gap-2 font-display text-[18px] font-bold text-white">
        <Clock className="h-5 w-5" aria-hidden="true" />
        Time Intel
    </span>
);

/**
 * The frame for sign in and sign up: the product's promise on one side (on top
 * on a phone), the form on the other.
 */
export const AuthLayout = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
    <div className="min-h-screen bg-[var(--color-bg)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:p-6">
        {/* Brand: a strip on phones, a full panel on wide screens. */}
        <aside className="hero-surface rounded-b-[28px] px-5 pb-16 pt-8 lg:flex lg:flex-col lg:justify-between lg:rounded-[28px] lg:p-10">
            <Wordmark />
            <div className="mt-6 max-w-[440px] lg:mt-0">
                <h1 className="font-display text-[28px] font-semibold leading-[1.15] text-balance lg:text-[40px]">
                    Spot free time. Build habits.
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-white/80">
                    Tell it your week once. It finds the gaps and sends the right habit to Telegram at the right
                    moment.
                </p>
                <div className="mt-8 hidden lg:block">
                    <MiniDay />
                </div>
            </div>
            <p className="hidden text-[13px] text-white/60 lg:block">For anyone with a busy week.</p>
        </aside>

        <main className="-mt-10 px-4 pb-10 lg:mt-0 lg:grid lg:place-items-center lg:p-0">
            <div className="mx-auto w-full max-w-[420px] rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_10px_30px_-18px_rgb(0_0_0/0.35)] sm:p-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <h2 className="font-display text-[24px] font-semibold text-[var(--color-ink)]">{title}</h2>
                <p className="mt-1 text-[14px] text-[var(--color-ink-muted)]">{subtitle}</p>
                <div className="mt-6">{children}</div>
            </div>
        </main>
    </div>
);
