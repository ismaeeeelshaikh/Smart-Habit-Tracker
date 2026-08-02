import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

const DashboardPlaceholder: React.FC = () => {
    return (
        <div className="flex h-screen flex-col items-center justify-center p-8 text-center">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="mt-4 text-gray-600">You have successfully authenticated.</p>
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    
                    <Route element={<ProtectedRoute />}>
                        <Route path="/dashboard" element={<DashboardPlaceholder />} />
                    </Route>

                    {/* Default fallback */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
