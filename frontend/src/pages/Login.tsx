import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { AuthLayout, PasswordInput, authInput, authLabel } from '../components/auth/AuthLayout';
import { apiUrl } from '../api';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const res = await fetch(apiUrl('/auth/login'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || 'Login failed');
            }

            const data = await res.json();
            const user = await login(data.access_token);
            navigate(user?.onboarding_completed_at ? '/dashboard' : '/onboarding/schedule');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AuthLayout title="Welcome back" subtitle="Sign in to see today's free time.">
            <form className="space-y-5" onSubmit={handleSubmit}>
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
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={authInput}
                        placeholder="you@example.com"
                    />
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
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
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
