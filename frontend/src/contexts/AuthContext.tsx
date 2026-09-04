import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getMe, setAccessToken, setSessionExpiredHandler } from '../api';
import type { User } from '../types';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: User | null;
    /** True once the user has finished (or skipped past) the setup wizard. */
    hasCompletedOnboarding: boolean;
    login: (token: string) => Promise<User | null>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const clearSession = useCallback(() => {
        setAccessToken(null);
        setUser(null);
        setIsAuthenticated(false);
    }, []);

    const refreshUser = useCallback(async (): Promise<User | null> => {
        try {
            const me = await getMe();
            setUser(me);
            setIsAuthenticated(true);
            return me;
        } catch {
            clearSession();
            return null;
        }
    }, [clearSession]);

    const login = useCallback(
        async (token: string) => {
            setAccessToken(token);
            setIsAuthenticated(true);
            return refreshUser();
        },
        [refreshUser],
    );

    const logout = useCallback(async () => {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch {
            // Network failure still clears local state — the cookie expires anyway.
        }
        clearSession();
    }, [clearSession]);

    useEffect(() => {
        // A failed refresh from inside apiFetch means the session is truly gone.
        setSessionExpiredHandler(clearSession);
        return () => setSessionExpiredHandler(null);
    }, [clearSession]);

    useEffect(() => {
        const silentRefresh = async () => {
            try {
                const res = await fetch('/auth/refresh', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    setAccessToken(data.access_token);
                    await refreshUser();
                }
            } catch {
                // Offline or no cookie — land on the login screen.
            } finally {
                setIsLoading(false);
            }
        };

        silentRefresh();
    }, [refreshUser]);

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isLoading,
                user,
                hasCompletedOnboarding: Boolean(user?.onboarding_completed_at),
                login,
                logout,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
