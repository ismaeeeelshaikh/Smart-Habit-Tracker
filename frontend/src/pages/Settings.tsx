import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, changePassword, updatePreferences } from '../api';

const inputClass =
    'block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] ' +
    'py-[10px] px-3 text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] text-[15px]';

const PasswordSection: React.FC = () => {
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
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <h3 className="font-inter font-medium text-[15px]">Change password</h3>

            {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
            {success && (
                <p className="text-[13px] text-[var(--color-priority-low)]" role="status">
                    {success}
                </p>
            )}

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

            <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Update password'}
            </Button>
        </form>
    );
};

/** Bounds free-slot detection: gaps outside these hours are never suggested. */
const ActiveHoursSection: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [start, setStart] = useState((user?.day_start_time ?? '08:00:00').slice(0, 5));
    const [end, setEnd] = useState((user?.day_end_time ?? '22:00:00').slice(0, 5));
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
            setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
                <h3 className="font-inter font-medium text-[15px]">Active hours</h3>
                <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
                    We only suggest habits inside these hours, so a gap at 3am never shows up.
                </p>
            </div>

            {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}
            {success && (
                <p className="text-[13px] text-[var(--color-priority-low)]" role="status">
                    {success}
                </p>
            )}

            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-[13px] font-medium mb-1" htmlFor="day-start">
                        From
                    </label>
                    <input
                        id="day-start"
                        type="time"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-[13px] font-medium mb-1" htmlFor="day-end">
                        To
                    </label>
                    <input
                        id="day-end"
                        type="time"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        className={inputClass}
                    />
                </div>
            </div>

            <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save active hours'}
            </Button>
        </form>
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
        <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl mx-auto">
            <header>
                <h1 className="font-display font-semibold text-[24px]">Settings</h1>
            </header>

            <Card className="p-6 space-y-6">
                <div className="space-y-2">
                    <h2 className="font-display font-semibold text-[18px]">Account</h2>
                    <div className="text-[15px] font-inter">
                        <span className="text-[var(--color-ink-muted)]">Email: </span>
                        <span>{user?.email ?? '—'}</span>
                    </div>
                    <div className="text-[15px] font-inter">
                        <span className="text-[var(--color-ink-muted)]">Timezone: </span>
                        <span>{user?.timezone ?? '—'}</span>
                    </div>
                </div>

                <div className="border-t border-[var(--color-border)] pt-6">
                    <ActiveHoursSection />
                </div>

                <div className="border-t border-[var(--color-border)] pt-6">
                    <PasswordSection />
                </div>
            </Card>

            <Card className="p-6 space-y-4">
                <h2 className="font-display font-semibold text-[18px]">Telegram</h2>
                {user?.telegram_linked ? (
                    <div className="text-[15px] font-inter">
                        Connected
                        {user.telegram_username ? ` as @${user.telegram_username}` : ''}.
                    </div>
                ) : (
                    <div className="bg-[var(--color-warning-bg)] p-4 rounded-[8px] text-[15px] font-inter text-[var(--color-ink)]">
                        You haven't connected Telegram yet. Reminders won't be delivered.
                    </div>
                )}
                {/* Link/disconnect flow lands in Phase 6 alongside the bot. */}
            </Card>

            <Card className="p-6 space-y-4">
                <h2 className="font-display font-semibold text-[18px]">Session</h2>
                <Button variant="secondary" onClick={handleLogout}>
                    Log out
                </Button>
            </Card>
        </div>
    );
};
