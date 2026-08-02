import React, { createContext, useContext, useState, useEffect } from 'react';
import { setAccessToken } from '../api';

interface AuthContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const login = (token: string) => {
        setAccessToken(token);
        setIsAuthenticated(true);
    };

    const logout = async () => {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch (e) {
            console.error('Logout error', e);
        }
        setAccessToken(null);
        setIsAuthenticated(false);
    };

    useEffect(() => {
        const silentRefresh = async () => {
            try {
                const res = await fetch('/auth/refresh', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    login(data.access_token);
                }
            } catch (e) {
                console.log('Silent refresh failed');
            } finally {
                setIsLoading(false);
            }
        };

        silentRefresh();
    }, []);

    return (
        <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
