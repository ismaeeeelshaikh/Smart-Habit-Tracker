import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { AuthLayout, PasswordInput, authInput, authLabel } from '../components/auth/AuthLayout';
import { apiUrl } from '../api';

export const Signup: React.FC = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Field errors
    const [nameError, setNameError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    const { login } = useAuth();
    const navigate = useNavigate();

    const validateName = () => {
        if (!fullName.trim()) {
            setNameError('Enter your name.');
            return false;
        }
        setNameError('');
        return true;
    };

    const validateEmail = () => {
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!isValid && email) {
            setEmailError('Please enter a valid email address.');
        } else {
            setEmailError('');
        }
        return isValid;
    };

    const validatePassword = () => {
        if (!password) return false;
        if (password.length < 8) {
            setPasswordError('Password must be at least 8 characters long.');
            return false;
        }
        if (!/\d/.test(password)) {
            setPasswordError('Password must contain at least 1 number.');
            return false;
        }
        setPasswordError('');
        return true;
    };

    const validateConfirmPassword = () => {
        if (password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match.');
            return false;
        }
        setConfirmPasswordError('');
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const isNameValid = validateName();
        const isEmailValid = validateEmail();
        const isPasswordValid = validatePassword();
        const isConfirmPasswordValid = validateConfirmPassword();

        if (!isNameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(apiUrl('/auth/signup'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName.trim(), email, password, timezone })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    setEmailError('An account with this email already exists.');
                    return;
                }
                const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
                throw new Error(detail || 'Signup failed');
            }

            const data = await res.json();
            await login(data.access_token);
            // New accounts always start the setup wizard.
            navigate('/onboarding/schedule');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Signup failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const fieldError = (message: string) =>
        message ? <p className="mt-1.5 text-[13px] text-[var(--color-error)]">{message}</p> : null;

    return (
        <AuthLayout title="Create your account" subtitle="Takes a minute. Then you set up your week.">
            <form className="space-y-5" onSubmit={handleSubmit}>
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
                        required
                        maxLength={100}
                        value={fullName}
                        onChange={(e) => { setFullName(e.target.value); setNameError(''); }}
                        onBlur={() => fullName && validateName()}
                        className={authInput}
                        placeholder="Your full name"
                    />
                    {fieldError(nameError)}
                </div>
                <div>
                    <label className={authLabel} htmlFor="email">Email address</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                        onBlur={validateEmail}
                        className={authInput}
                        placeholder="you@example.com"
                    />
                    {fieldError(emailError)}
                </div>
                <div>
                    <label className={authLabel} htmlFor="password">Password</label>
                    <PasswordInput
                        id="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                        onBlur={validatePassword}
                    />
                    {passwordError ? (
                        fieldError(passwordError)
                    ) : (
                        <p className="mt-1.5 text-[12px] text-[var(--color-ink-muted)]">
                            At least 8 characters, with a number.
                        </p>
                    )}
                </div>
                <div>
                    <label className={authLabel} htmlFor="confirm-password">Confirm Password</label>
                    <PasswordInput
                        id="confirm-password"
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setConfirmPasswordError(''); }}
                        onBlur={validateConfirmPassword}
                    />
                    {fieldError(confirmPasswordError)}
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
