import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';

export const Signup: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [error, setError] = useState('');
    
    // Field errors
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    const { login } = useAuth();
    const navigate = useNavigate();

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
        
        const isEmailValid = validateEmail();
        const isPasswordValid = validatePassword();
        const isConfirmPasswordValid = validateConfirmPassword();

        if (!isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
            return;
        }

        try {
            const res = await fetch('/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, timezone })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Signup failed');
            }

            const data = await res.json();
            login(data.access_token);
            navigate('/onboarding/schedule');
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
            <div className="w-full max-w-md space-y-8 rounded-[10px] bg-[var(--color-surface)] p-8 shadow-sm border border-[var(--color-border)]">
                <div className="text-center">
                    <h2 className="text-[24px] font-display font-semibold text-[var(--color-ink)]">Create Account</h2>
                    <p className="mt-2 text-[15px] font-inter text-[var(--color-ink-muted)]">Start managing your time intelligently</p>
                </div>
                
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="rounded-[10px] bg-[var(--color-warning-bg)] p-4 text-[13px] text-[var(--color-ink)] border border-[var(--color-border)] font-medium">
                            {error}
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1" htmlFor="email">Email address</label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                                onBlur={validateEmail}
                                className="block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-[10px] px-3 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] sm:text-[15px]"
                                placeholder="Email address"
                            />
                            {emailError && <p className="mt-1 text-[13px] text-[var(--color-error)]">{emailError}</p>}
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1" htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                                onBlur={validatePassword}
                                className="block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-[10px] px-3 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] sm:text-[15px]"
                                placeholder="Password"
                            />
                            {passwordError && <p className="mt-1 text-[13px] text-[var(--color-error)]">{passwordError}</p>}
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1" htmlFor="confirm-password">Confirm Password</label>
                            <input
                                id="confirm-password"
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); setConfirmPasswordError(''); }}
                                onBlur={validateConfirmPassword}
                                className="block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-[10px] px-3 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] sm:text-[15px]"
                                placeholder="Confirm Password"
                            />
                            {confirmPasswordError && <p className="mt-1 text-[13px] text-[var(--color-error)]">{confirmPasswordError}</p>}
                        </div>
                    </div>

                    <Button type="submit" className="w-full">
                        Sign up
                    </Button>
                </form>
                
                <div className="text-center text-[15px]">
                    <Link to="/login" className="font-medium text-[var(--color-free)] hover:brightness-90 transition-all">
                        Already have an account? Log in
                    </Link>
                </div>
            </div>
        </div>
    );
};
