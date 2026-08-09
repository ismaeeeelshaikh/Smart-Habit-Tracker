import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getScheduleBlocks, getGoals } from '../api';
import { Button } from '../components/ui/Button';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        try {
            const res = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || 'Login failed');
            }

            const data = await res.json();
            login(data.access_token);
            
            // Heuristic check for onboarding status
            try {
                const [blocks, goals] = await Promise.all([
                    getScheduleBlocks(),
                    getGoals()
                ]);
                if (blocks.length === 0 && goals.length === 0) {
                    navigate('/onboarding/schedule');
                } else {
                    navigate('/dashboard');
                }
            } catch (err) {
                // Fallback on error
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
            <div className="w-full max-w-md space-y-8 rounded-[10px] bg-[var(--color-surface)] p-8 shadow-sm border border-[var(--color-border)]">
                <div className="text-center">
                    <h2 className="text-[24px] font-display font-semibold text-[var(--color-ink)]">Sign in</h2>
                    <p className="mt-2 text-[15px] font-inter text-[var(--color-ink-muted)]">Welcome back to Personal Time Intelligence</p>
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
                                onChange={(e) => setEmail(e.target.value)}
                                className="block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-[10px] px-3 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] sm:text-[15px]"
                                placeholder="Email address"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-medium text-[var(--color-ink)] mb-1" htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] py-[10px] px-3 text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-free)] sm:text-[15px]"
                                placeholder="Password"
                            />
                        </div>
                    </div>

                    <Button type="submit" className="w-full">
                        Sign in
                    </Button>
                </form>
                
                <div className="text-center text-[15px] space-y-3 flex flex-col">
                    <Link to="/signup" className="font-medium text-[var(--color-free)] hover:brightness-90 transition-all">
                        Don't have an account? Sign up
                    </Link>
                    <span title="Coming soon" className="font-medium text-[var(--color-ink-muted)] opacity-50 cursor-not-allowed pointer-events-none text-[13px]">
                        Forgot password?
                    </span>
                </div>
            </div>
        </div>
    );
};
