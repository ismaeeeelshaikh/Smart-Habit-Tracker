import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
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

const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* Public Auth Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    
                    {/* Protected Routes */}
                    <Route element={<ProtectedRoute />}>
                        {/* Onboarding Flow (Standalone layout) */}
                        <Route path="/onboarding/schedule" element={<ScheduleSetup />} />
                        <Route path="/onboarding/goals" element={<GoalSetup />} />
                        <Route path="/onboarding/telegram-link" element={<TelegramLink />} />

                        {/* Main App with Shell Layout */}
                        <Route element={<AppLayout />}>
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/schedule" element={<Schedule />} />
                            <Route path="/goals" element={<Goals />} />
                            <Route path="/reminders" element={<Reminders />} />
                            <Route path="/stats" element={<Stats />} />
                            <Route path="/settings" element={<Settings />} />
                        </Route>
                    </Route>

                    {/* Root Redirect */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    
                    {/* Catch all */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
