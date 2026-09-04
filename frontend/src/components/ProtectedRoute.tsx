import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const FullPageLoader = () => (
    <div
        role="status"
        aria-live="polite"
        className="flex h-screen items-center justify-center text-[var(--color-ink-muted)]"
    >
        Loading...
    </div>
);

/** Requires a signed-in user. Anything else goes to /login. */
export const ProtectedRoute: React.FC = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) return <FullPageLoader />;
    if (!isAuthenticated) {
        // Remember where they were headed so login can send them back.
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return <Outlet />;
};

/**
 * Guards the main app: a user who has not finished setup is sent back into the
 * wizard, so a refresh mid-onboarding cannot strand them on an empty dashboard.
 */
export const RequireOnboarding: React.FC = () => {
    const { isLoading, hasCompletedOnboarding } = useAuth();

    if (isLoading) return <FullPageLoader />;
    if (!hasCompletedOnboarding) return <Navigate to="/onboarding/schedule" replace />;
    return <Outlet />;
};

/** Keeps users who already finished setup out of the wizard. */
export const RequireIncompleteOnboarding: React.FC = () => {
    const { isLoading, hasCompletedOnboarding } = useAuth();

    if (isLoading) return <FullPageLoader />;
    if (hasCompletedOnboarding) return <Navigate to="/dashboard" replace />;
    return <Outlet />;
};
