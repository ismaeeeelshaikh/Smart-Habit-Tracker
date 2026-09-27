import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { AuthLayout, PasswordInput, authInput, authLabel } from '../components/auth/AuthLayout';
import { apiUrl } from '../api';
import { cn } from '../utils/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Field = 'fullName' | 'email' | 'password' | 'confirmPassword';
type Values = Record<Field, string>;

/** Every rule in one place, so blur and submit can't disagree. */
const validate = (v: Values): Partial<Record<Field, string>> => {
    const errors: Partial<Record<Field, string>> = {};
    if (!v.fullName.trim()) errors.fullName = 'Enter your name.';
    if (!v.email.trim()) errors.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(v.email.trim())) errors.email = 'Enter a valid email address, like you@example.com.';
    if (!v.password) errors.password = 'Choose a password.';
    else if (v.password.length < 8 || !/\d/.test(v.password))
        errors.password = 'Use at least 8 characters, including a number.';
    if (!v.confirmPassword) errors.confirmPassword = 'Type the password again.';
    else if (v.confirmPassword !== v.password) errors.confirmPassword = "The passwords don't match.";
    return errors;
};

/** Ticks off the password rules as they are met. */
const Rule = ({ met, children }: { met: boolean; children: React.ReactNode }) => (
    <li className={cn('flex items-center gap-1.5', met ? 'text-[var(--color-priority-low)]' : 'text-[var(--color-ink-muted)]')}>
        {met ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : <Circle aria-hidden="true" className="h-3 w-3" />}
        {children}
        <span className="sr-only">{met ? '(done)' : '(not yet)'}</span>
    </li>
);

export const Signup: React.FC = () => {
    const [values, setValues] = useState<Values>({ fullName: '', email: '', password: '', confirmPassword: '' });
    const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
    const [serverEmailError, setServerEmailError] = useState('');
    const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const errors = validate(values);
    // A field complains once it has been left, or after a submit attempt.
    const shown = (field: Field) => (touched[field] ? errors[field] : undefined);

    const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setValues((v) => ({ ...v, [field]: e.target.value }));
        if (field === 'email') setServerEmailError('');
    };
    const leave = (field: Field) => () => {
        // An untouched, empty field isn't nagged about just for tabbing past it.
        if (values[field]) setTouched((t) => ({ ...t, [field]: true }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(apiUrl('/auth/signup'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: values.fullName.trim(),
                    email: values.email.trim(),
                    password: values.password,
                    timezone,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    setServerEmailError('An account with this email already exists. Sign in instead?');
                    return;
                }
                if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
                const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
                throw new Error(detail || "Couldn't create your account. Please try again.");
            }

            const data = await res.json();
            const user = await login(data.access_token);
            // A new account confirms its email first (when that's switched on),
            // then starts the setup wizard.
            navigate(user && !user.email_verified ? '/verify-email' : '/onboarding/schedule');
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't create your account. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const fieldError = (id: string, message?: string) =>
        message ? (
            <p id={id} className="mt-1.5 text-[13px] text-[var(--color-error)]">
                {message}
            </p>
        ) : null;

    const invalid = (message?: string) => cn(authInput, message && 'border-[var(--color-error)]');
    const emailMessage = serverEmailError || shown('email');

    return (
        <AuthLayout title="Create your account" subtitle="Takes a minute. Then you set up your week.">
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {error && (
                    <div role="alert" className="rounded-[12px] bg-[var(--color-warning-bg)] px-4 py-3 text-[14px] font-medium text-[var(--color-ink)]">
                        {error}
                    </div>
                )}

                <div>
                    <label className={authLabel} htmlFor="full-name">Full name</label>
                    <input
                        id="full-name"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={values.fullName}
                        onChange={set('fullName')}
                        onBlur={leave('fullName')}
                        aria-invalid={shown('fullName') ? true : undefined}
                        aria-describedby={shown('fullName') ? 'full-name-error' : undefined}
                        className={invalid(shown('fullName'))}
                        placeholder="Your full name"
                    />
                    {fieldError('full-name-error', shown('fullName'))}
                </div>

                <div>
                    <label className={authLabel} htmlFor="email">Email address</label>
                    <input
                        id="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={values.email}
                        onChange={set('email')}
                        onBlur={leave('email')}
                        aria-invalid={emailMessage ? true : undefined}
                        aria-describedby={emailMessage ? 'email-error' : undefined}
                        className={invalid(emailMessage)}
                        placeholder="you@example.com"
                    />
                    {fieldError('email-error', emailMessage)}
                    {serverEmailError && (
                        <Link to="/login" className="mt-1 inline-block text-[13px] font-semibold text-[var(--color-free)]">
                            Go to sign in
                        </Link>
                    )}
                </div>

                <div>
                    <label className={authLabel} htmlFor="password">Password</label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        value={values.password}
                        onChange={set('password')}
                        onBlur={leave('password')}
                        aria-invalid={shown('password') ? true : undefined}
                        aria-describedby="password-rules"
                    />
                    <ul id="password-rules" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                        <Rule met={values.password.length >= 8}>At least 8 characters</Rule>
                        <Rule met={/\d/.test(values.password)}>A number</Rule>
                    </ul>
                    {fieldError('password-error', shown('password'))}
                </div>

                <div>
                    <label className={authLabel} htmlFor="confirm-password">Confirm Password</label>
                    <PasswordInput
                        id="confirm-password"
                        autoComplete="new-password"
                        value={values.confirmPassword}
                        onChange={set('confirmPassword')}
                        onBlur={leave('confirmPassword')}
                        aria-invalid={shown('confirmPassword') ? true : undefined}
                        aria-describedby={shown('confirmPassword') ? 'confirm-error' : undefined}
                    />
                    {fieldError('confirm-error', shown('confirmPassword'))}
                </div>

                <Button type="submit" className="w-full h-12 rounded-[12px]" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating account…' : 'Sign up'}
                </Button>
            </form>

            <p className="mt-6 text-center text-[14px] text-[var(--color-ink-muted)]">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-[var(--color-free)] hover:brightness-90">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
};
