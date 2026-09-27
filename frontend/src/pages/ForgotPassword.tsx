import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, PasswordInput, authInput, authLabel } from '../components/auth/AuthLayout';
import { Button } from '../components/ui/Button';
import { ApiError, forgotPassword, resetPassword } from '../api';
import { cn } from '../utils/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Forgot password, in two steps on one screen: the email gets a 6-digit code,
 * then the code and a new password set it. Every device is signed out after.
 */
export const ForgotPassword: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<'email' | 'reset'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [fieldError, setFieldError] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const sendCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError('');
        if (!email.trim()) return setFieldError({ email: 'Enter your email address.' });
        if (!EMAIL_PATTERN.test(email.trim()))
            return setFieldError({ email: 'Enter a valid email address, like you@example.com.' });
        setFieldError({});
        setIsBusy(true);
        try {
            await forgotPassword(email.trim());
            setStep('reset');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't send the code. Please try again.");
        } finally {
            setIsBusy(false);
        }
    };

    const submitReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const errors: Record<string, string> = {};
        if (code.length !== 6) errors.code = 'Enter the 6-digit code from the email.';
        if (password.length < 8 || !/\d/.test(password))
            errors.password = 'Use at least 8 characters, including a number.';
        if (confirm !== password) errors.confirm = "The passwords don't match.";
        setFieldError(errors);
        if (Object.keys(errors).length > 0) return;

        setIsBusy(true);
        try {
            await resetPassword(email.trim(), code, password);
            navigate('/login', { replace: true, state: { notice: 'Password changed. Sign in with the new one.' } });
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't change the password. Please try again.");
        } finally {
            setIsBusy(false);
        }
    };

    const message = (id: string, text?: string) =>
        text ? (
            <p id={id} className="mt-1.5 text-[13px] text-[var(--color-error)]">
                {text}
            </p>
        ) : null;

    return (
        <AuthLayout
            title={step === 'email' ? 'Forgot your password?' : 'Choose a new password'}
            subtitle={
                step === 'email'
                    ? "Enter your email and we'll send you a 6-digit code."
                    : `If ${email.trim()} has an account, the code is on its way.`
            }
        >
            {error && (
                <div role="alert" className="mb-5 rounded-[12px] bg-[var(--color-warning-bg)] px-4 py-3 text-[14px] font-medium text-[var(--color-ink)]">
                    {error}
                </div>
            )}

            {step === 'email' ? (
                <form className="space-y-5" onSubmit={sendCode} noValidate>
                    <div>
                        <label className={authLabel} htmlFor="email">Email address</label>
                        <input
                            id="email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            aria-invalid={fieldError.email ? true : undefined}
                            aria-describedby={fieldError.email ? 'email-error' : undefined}
                            className={cn(authInput, fieldError.email && 'border-[var(--color-error)]')}
                            placeholder="you@example.com"
                            autoFocus
                        />
                        {message('email-error', fieldError.email)}
                    </div>
                    <Button type="submit" className="h-12 w-full rounded-[12px]" disabled={isBusy}>
                        {isBusy ? 'Sending…' : 'Send code'}
                    </Button>
                </form>
            ) : (
                <form className="space-y-5" onSubmit={submitReset} noValidate>
                    <div>
                        <label className={authLabel} htmlFor="reset-code">6-digit code</label>
                        <input
                            id="reset-code"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            aria-invalid={fieldError.code ? true : undefined}
                            aria-describedby={fieldError.code ? 'code-error' : undefined}
                            className={cn(
                                authInput,
                                'h-14 text-center font-mono text-[26px] tracking-[0.5em]',
                                fieldError.code && 'border-[var(--color-error)]',
                            )}
                            placeholder="••••••"
                            autoFocus
                        />
                        {message('code-error', fieldError.code)}
                    </div>
                    <div>
                        <label className={authLabel} htmlFor="new-password">New password</label>
                        <PasswordInput
                            id="new-password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            aria-invalid={fieldError.password ? true : undefined}
                            aria-describedby="new-password-hint"
                        />
                        {fieldError.password ? (
                            message('new-password-hint', fieldError.password)
                        ) : (
                            <p id="new-password-hint" className="mt-1.5 text-[12px] text-[var(--color-ink-muted)]">
                                At least 8 characters, with a number.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className={authLabel} htmlFor="confirm-new-password">Confirm new password</label>
                        <PasswordInput
                            id="confirm-new-password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            aria-invalid={fieldError.confirm ? true : undefined}
                            aria-describedby={fieldError.confirm ? 'confirm-error' : undefined}
                        />
                        {message('confirm-error', fieldError.confirm)}
                    </div>
                    <Button type="submit" className="h-12 w-full rounded-[12px]" disabled={isBusy}>
                        {isBusy ? 'Saving…' : 'Change password'}
                    </Button>
                    <div className="flex flex-wrap justify-between gap-2 text-[14px]">
                        <button
                            type="button"
                            onClick={() => sendCode()}
                            disabled={isBusy}
                            className="min-h-[44px] font-medium text-[var(--color-free)] disabled:text-[var(--color-ink-muted)]"
                        >
                            Send the code again
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setStep('email');
                                setCode('');
                                setError('');
                            }}
                            className="min-h-[44px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                        >
                            Use a different email
                        </button>
                    </div>
                </form>
            )}

            <p className="mt-6 text-center text-[14px] text-[var(--color-ink-muted)]">
                Remembered it?{' '}
                <Link to="/login" className="font-semibold text-[var(--color-free)] hover:brightness-90">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
};
