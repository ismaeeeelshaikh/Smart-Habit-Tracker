import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, KeyRound, LogOut, Send } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { TimePicker } from '../components/ui/TimePicker';
import { TelegramConnect } from '../components/telegram/TelegramConnect';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, changePassword, disconnectTelegram, updatePreferences } from '../api';
import { formatDuration, formatTime, toMinutes } from '../utils/time';

const inputClass =
    'block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] ' +
    'h-11 px-3 text-[var(--color-ink)] focus-visible:outline-none focus-visible:border-[var(--color-free)] focus-visible:ring-[3px] focus-visible:ring-[var(--color-free-tint)] text-[15px]';

const card = 'rounded-[16px] p-4 sm:p-5 space-y-4';

/** A card's heading with its icon, the same shape on every section. */
const SectionHeading = ({
    icon: Icon,
    title,
    hint,
}: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    hint?: string;
}) => (
    <div className="flex items-start gap-3">
        <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-free-tint)] text-[var(--color-free)]"
        >
            <Icon className="h-4 w-4" />
        </span>
        <div>
            <h2 className="font-display text-[17px] font-semibold leading-tight text-[var(--color-ink)]">{title}</h2>
            {hint && <p className="mt-1 text-[13px] leading-snug text-[var(--color-ink-muted)]">{hint}</p>}
        </div>
    </div>
);

const PasswordSection: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (next.length < 8 || !/\d/.test(next)) {
            setError('New password must be at least 8 characters and contain a number.');
            return;
        }
        if (next !== confirm) {
            setError('New passwords do not match.');
            return;
        }

        setIsSaving(true);
        try {
            await changePassword(current, next);
            setSuccess('Password updated. Other devices have been signed out.');
            setCurrent('');
            setNext('');
            setConfirm('');
            setIsOpen(false);
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading icon={KeyRound} title="Password" />
                {!isOpen && (
                    <Button variant="secondary" className="text-sm px-3 py-1.5 h-auto" onClick={() => setIsOpen(true)}>
                        Change password
                    </Button>
                )}
            </div>

            {success && (
                <p className="text-[13px] text-[var(--color-priority-low)]" role="status">
                    {success}
                </p>
            )}

            {isOpen && (
                <form className="space-y-3" onSubmit={handleSubmit}>
                    {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
                    <div>
                        <label className="block text-[13px] font-medium mb-1" htmlFor="current-password">
                            Current password
                        </label>
                        <input
                            id="current-password"
                            type="password"
                            autoComplete="current-password"
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium mb-1" htmlFor="new-password">
                            New password
                        </label>
                        <input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            value={next}
                            onChange={(e) => setNext(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-medium mb-1" htmlFor="confirm-new-password">
                            Confirm new password
                        </label>
                        <input
                            id="confirm-new-password"
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? 'Saving…' : 'Update password'}
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
};

/** Bounds free-slot detection: gaps outside these hours are never suggested. */
const ActiveHoursSection: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const savedStart = (user?.day_start_time ?? '08:00:00').slice(0, 5);
    const savedEnd = (user?.day_end_time ?? '22:00:00').slice(0, 5);
    const [start, setStart] = useState(savedStart);
    const [end, setEnd] = useState(savedEnd);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const span = toMinutes(end) - toMinutes(start);
    const changed = start !== savedStart || end !== savedEnd;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (start >= end) {
            setError('End time must be after start time.');
            return;
        }

        setIsSaving(true);
        try {
            await updatePreferences({
                day_start_time: `${start}:00`,
                day_end_time: `${end}:00`,
            });
            await refreshUser();
            setSuccess('Active hours updated.');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <SectionHeading
                icon={Clock}
                title="Active hours"
                hint="We only suggest habits inside these hours, so a gap at 3 AM never shows up."
            />

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[13px] font-medium mb-1" htmlFor="day-start">
                        From
                    </label>
                    <TimePicker id="day-start" value={start} onChange={setStart} />
                </div>
                <div>
                    <label className="block text-[13px] font-medium mb-1" htmlFor="day-end">
                        To
                    </label>
                    <TimePicker id="day-end" value={end} onChange={setEnd} />
                </div>
            </div>

            <p className="text-[13px] text-[var(--color-ink-muted)]">
                {span > 0 ? (
                    <>
                        Suggestions between <span className="font-mono">{formatTime(start)}</span> and{' '}
                        <span className="font-mono">{formatTime(end)}</span> ·{' '}
                        <span className="font-mono">{formatDuration(span)}</span> a day
                    </>
                ) : (
                    'Pick an end time after the start time.'
                )}
            </p>

            {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
            {success && !changed && (
                <p className="text-[13px] text-[var(--color-priority-low)]" role="status">
                    {success}
                </p>
            )}

            <Button type="submit" disabled={isSaving || !changed}>
                {isSaving ? 'Saving…' : 'Save active hours'}
            </Button>
        </form>
    );
};

const TelegramSection = () => {
    const { user, refreshUser } = useAuth();
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDisconnect = async () => {
        setError(null);
        setIsDisconnecting(true);
        try {
            await disconnectTelegram();
            await refreshUser();
            setIsConfirming(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Couldn't disconnect Telegram. Please try again.",
            );
        } finally {
            setIsDisconnecting(false);
        }
    };

    if (!user?.telegram_linked) {
        return (
            <div className="space-y-4">
                <SectionHeading icon={Send} title="Telegram" hint="Reminders and suggestions arrive here." />
                <div className="bg-[var(--color-warning-bg)] px-4 py-3 rounded-[12px] text-[15px] font-inter text-[var(--color-ink)]">
                    You haven't connected Telegram yet. Reminders won't be delivered.
                </div>
                <TelegramConnect onConnected={refreshUser} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading icon={Send} title="Telegram" hint="Reminders and suggestions arrive here." />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-free-tint)] px-2.5 py-1 font-inter text-[12px] font-medium text-[var(--color-free)]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-free)]" />
                    Connected
                </span>
            </div>

            {user.telegram_username && (
                <p className="font-mono text-[14px] text-[var(--color-ink)]">@{user.telegram_username}</p>
            )}

            {isConfirming ? (
                <div className="space-y-2 rounded-[12px] bg-[var(--color-surface-soft)] p-3">
                    <p className="text-[13px] text-[var(--color-ink-muted)]">
                        Disconnect Telegram? Reminders stop being delivered. Your history stays.
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={() => setIsConfirming(false)}
                            disabled={isDisconnecting}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
                            {isDisconnecting ? 'Disconnecting…' : 'Yes, disconnect'}
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="destructive" className="-ml-3" onClick={() => setIsConfirming(true)}>
                    Disconnect
                </Button>
            )}

            {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
        </div>
    );
};

export const Settings = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 max-w-[720px] mx-auto mb-12">
            <header>
                <h1 className="font-display font-semibold text-[26px] leading-[32px] sm:text-[28px] text-[var(--color-ink)]">
                    Settings
                </h1>
            </header>

            <Card className="rounded-[16px] p-4 sm:p-5 flex items-center gap-4">
                <span
                    aria-hidden="true"
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] font-display text-[18px] font-semibold uppercase text-[var(--color-ink)]"
                >
                    {user?.email?.[0] ?? '?'}
                </span>
                <div className="min-w-0">
                    <p className="font-inter text-[15px] font-medium text-[var(--color-ink)] break-all">
                        {user?.email ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
                        Timezone <span className="font-mono">{user?.timezone ?? '—'}</span>
                    </p>
                </div>
            </Card>

            <Card className={card}>
                <TelegramSection />
            </Card>

            {/* Mounted once the user is known, so the pickers start from the saved hours. */}
            {user && (
                <Card className={card}>
                    <ActiveHoursSection />
                </Card>
            )}

            <Card className={card}>
                <PasswordSection />
            </Card>

            <button
                type="button"
                onClick={handleLogout}
                className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] font-inter text-[15px] font-medium text-[var(--color-error)] transition-colors touch-manipulation hover:bg-[var(--color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
            >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                Log out
            </button>
        </div>
    );
};
