import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { AuthLayout, PasswordInput, authInput, authLabel } from '../components/auth/AuthLayout';
import { apiUrl } from '../api';
import { cn } from '../utils/cn';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validate = (email: string, password: string) => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = 'Enter your email address.';
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address, like you@example.com.';
    if (!password) errors.password = 'Enter your password.';
    return errors;
};

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [emailLeft, setEmailLeft] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const errors = validate(email, password);
    const emailError = submitted || emailLeft ? errors.email : undefined;
    const passwordError = submitted ? errors.password : undefined;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitted(true);
        if (errors.email || errors.password) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(apiUrl('/auth/login'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 401) throw new Error('That email and password don’t match. Try again.');
                if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
                throw new Error(data.detail || "Couldn't sign you in. Please try again.");
            }

            const data = await res.json();
            const user = await login(data.access_token);
            navigate(
                user && !user.email_verified
                    ? '/verify-email'
                    : user?.onboarding_completed_at
                      ? '/dashboard'
                      : '/onboarding/schedule',
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't sign you in. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AuthLayout title="Welcome back" subtitle="Sign in to see today's free time.">
            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                {error && (
                    <div role="alert" className="rounded-[12px] bg-[var(--color-warning-bg)] px-4 py-3 text-[14px] font-medium text-[var(--color-ink)]">
                        {error}
                    </div>
                )}

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
                        onBlur={() => email && setEmailLeft(true)}
                        aria-invalid={emailError ? true : undefined}
                        aria-describedby={emailError ? 'email-error' : undefined}
                        className={cn(authInput, emailError && 'border-[var(--color-error)]')}
                        placeholder="you@example.com"
                    />
                    {emailError && (
                        <p id="email-error" className="mt-1.5 text-[13px] text-[var(--color-error)]">
                            {emailError}
                        </p>
                    )}
                </div>
                <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                        <label className="text-[13px] font-medium text-[var(--color-ink)]" htmlFor="password">Password</label>
                        <span title="Coming soon" className="text-[12px] text-[var(--color-ink-muted)] opacity-60">
                            Forgot password?
                        </span>
                    </div>
                    <PasswordInput
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={passwordError ? true : undefined}
                        aria-describedby={passwordError ? 'password-error' : undefined}
                    />
                    {passwordError && (
                        <p id="password-error" className="mt-1.5 text-[13px] text-[var(--color-error)]">
                            {passwordError}
                        </p>
                    )}
                </div>

                <Button type="submit" className="w-full h-12 rounded-[12px]" disabled={isSubmitting}>
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
            </form>

            <p className="mt-6 text-center text-[14px] text-[var(--color-ink-muted)]">
                New here?{' '}
                <Link to="/signup" className="font-semibold text-[var(--color-free)] hover:brightness-90">
                    Create an account
                </Link>
            </p>
        </AuthLayout>
    );
};
