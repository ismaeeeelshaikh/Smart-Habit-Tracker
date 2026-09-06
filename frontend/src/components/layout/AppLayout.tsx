import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Target, 
  Bell, 
  BarChart3, 
  Settings, 
  LogOut 
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../utils/cn';

export const AppLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/goals', label: 'Goals', icon: Target },
    { to: '/reminders', label: 'Reminders', icon: Bell },
    { to: '/stats', label: 'Stats', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-[8px] focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:ring-2 focus:ring-[var(--color-free)] font-inter text-[15px]"
      >
        Skip to main content
      </a>
      {/* Desktop Top Nav */}
      <header className="hidden sm:block bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-10">
        <div className="max-w-[960px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <span className="font-display font-bold text-[var(--color-ink)] text-lg">Time Intel</span>
            <nav className="flex items-center space-x-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-2 rounded-md font-inter text-sm font-medium transition-colors flex items-center space-x-2 min-h-[44px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]",
                      isActive 
                        ? "text-[var(--color-free)] bg-[var(--color-free-tint)]" 
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-gray-50"
                    )
                  }
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center space-x-2 min-h-[44px] px-3 rounded-[8px] text-[var(--color-ink-muted)] hover:text-[var(--color-error)] font-inter text-sm font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main" tabIndex={-1} className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Primary"
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center w-full h-full min-h-[44px] space-y-1 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-free)]",
                  isActive 
                    ? "text-[var(--color-free)]" 
                    : "text-[var(--color-ink-muted)]"
                )
              }
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[10px] font-inter font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
