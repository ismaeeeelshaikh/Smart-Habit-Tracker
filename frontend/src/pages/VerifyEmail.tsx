import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthLayout, authInput } from '../components/auth/AuthLayout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { ApiError, resendVerification, verifyEmail } from '../api';
import { cn } from '../utils/cn';

/** Matches EMAIL_CODE_RESEND_SECONDS on the server. */
const RESEND_SECONDS = 60;

/** Enter the 6-digit code mailed at signup. */
export const VerifyEmail: React.FC = () => {
    const { user, refreshUser, logout } = useAuth();
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [isSending, setIsSending] = useState(false);
    // The signup just sent one, so the first resend waits a minute.
    const [wait, setWait] = useState(RESEND_SECONDS);
    const lastTried = useRef('');

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const check = async (value: string) => {
        if (value.length !== 6 || isChecking) return;
        lastTried.current = value;
        setError('');
        setNotice('');
        setIsChecking(true);
        try {
            await verifyEmail(value);
            const fresh = await refreshUser();
            navigate(fresh?.onboarding_completed_at ? '/dashboard' : '/onboarding/schedule', { replace: true });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't check that code. Please try again.");
        } finally {
            setIsChecking(false);
        }
    };

    const onChange = (raw: string) => {
        const digits = raw.replace(/\D/g, '').slice(0, 6);
        setCode(digits);
        setError('');
        // A full code is checked straight away — once, not again on every render.
        if (digits.length === 6 && digits !== lastTried.current) check(digits);
    };

    const resend = async () => {
        setError('');
        setNotice('');
        setIsSending(true);
        try {
            await resendVerification();
            setNotice(`A new code is on its way to ${user?.email}.`);
            setCode('');
            lastTried.current = '';
            setWait(RESEND_SECONDS);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't send a new code. Please try again.");
        } finally {
            setIsSending(false);
        }
    };

    const signOut = async () => {
        await logout();
        navigate('/signup', { replace: true });
    };

    if (user?.email_verified) {
        return <Navigate to={user.onboarding_completed_at ? '/dashboard' : '/onboarding/schedule'} replace />;
    }

    return (
        <AuthLayout title="Check your email" subtitle="Enter the 6-digit code we sent to finish signing up.">
            <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-[12px] bg-[var(--color-free-tint)] px-4 py-3">
                    <MailCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-free)]" />
                    <p className="min-w-0 text-[14px] text-[var(--color-ink)]">
                        Sent to <span className="font-medium break-all">{user?.email}</span>
                    </p>
                </div>

                <form
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (code.length !== 6) {
                            setError('Enter all 6 digits.');
                            return;
                        }
                        check(code);
                    }}
                    className="space-y-4"
                >
                    <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink)]" htmlFor="code">
                            6-digit code
                        </label>
                        <input
                            id="code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={code}
                            onChange={(e) => onChange(e.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? 'code-error' : undefined}
                            className={cn(
                                authInput,
                                'h-14 text-center font-mono text-[26px] tracking-[0.5em]',
                                error && 'border-[var(--color-error)]',
                            )}
                            placeholder="••••••"
                            autoFocus
                        />
                        {error && (
                            <p id="code-error" role="alert" className="mt-1.5 text-[13px] text-[var(--color-error)]">
                                {error}
                            </p>
                        )}
                        {notice && (
                            <p role="status" className="mt-1.5 text-[13px] text-[var(--color-priority-low)]">
                                {notice}
                            </p>
                        )}
                    </div>

                    <Button type="submit" className="h-12 w-full rounded-[12px]" disabled={isChecking}>
                        {isChecking ? 'Checking…' : 'Verify email'}
                    </Button>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
                    <button
                        type="button"
                        onClick={resend}
                        disabled={wait > 0 || isSending}
                        className="min-h-[44px] rounded-[8px] font-medium text-[var(--color-free)] disabled:text-[var(--color-ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                    >
                        {isSending ? 'Sending…' : wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
                    </button>
                    <button
                        type="button"
                        onClick={signOut}
                        className="min-h-[44px] rounded-[8px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]"
                    >
                        Wrong email? Sign out
                    </button>
                </div>

                <p className="text-[12px] text-[var(--color-ink-muted)]">Can't find it? Check your spam folder.</p>
            </div>
        </AuthLayout>
    );
};
