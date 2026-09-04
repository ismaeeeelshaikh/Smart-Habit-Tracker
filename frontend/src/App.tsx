import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import {
    ProtectedRoute,
    RequireIncompleteOnboarding,
    RequireOnboarding,
} from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Schedule } from './pages/Schedule';
import { Goals } from './pages/Goals';
import { Reminders } from './pages/Reminders';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { ScheduleSetup } from './pages/onboarding/ScheduleSetup';
import { GoalSetup } from './pages/onboarding/GoalSetup';
import { TelegramLink } from './pages/onboarding/TelegramLink';
import { NotFound } from './pages/NotFound';

export const AppRoutes: React.FC = () => (
    <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
            {/* Onboarding Flow (standalone layout, only before setup is done) */}
            <Route element={<RequireIncompleteOnboarding />}>
                <Route path="/onboarding/schedule" element={<ScheduleSetup />} />
                <Route path="/onboarding/goals" element={<GoalSetup />} />
                <Route path="/onboarding/telegram-link" element={<TelegramLink />} />
            </Route>

            {/* Main App with Shell Layout */}
            <Route element={<RequireOnboarding />}>
                <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/schedule" element={<Schedule />} />
                    <Route path="/goals" element={<Goals />} />
                    <Route path="/reminders" element={<Reminders />} />
                    <Route path="/stats" element={<Stats />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
            </Route>
        </Route>

        {/* Root Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Catch all */}
        <Route path="*" element={<NotFound />} />
    </Routes>
);

const App: React.FC = () => (
    <AuthProvider>
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    </AuthProvider>
);

export default App;
