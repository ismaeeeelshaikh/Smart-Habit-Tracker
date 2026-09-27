import { useCallback, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Target,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Clock,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../ui/Modal';
import { cn } from '../../utils/cn';

// Design Brief 6: five tabs on a phone; the rest sit behind "More".
const MOBILE_TABS = ['/dashboard', '/schedule', '/goals', '/stats'];
const MORE_ROUTES = ['/reminders', '/settings'];

const Wordmark = () => (
  <span className="flex items-center gap-2 font-display font-bold text-[var(--color-ink)] text-lg">
    <Clock className="w-5 h-5" aria-hidden="true" />
    Time Intel
  </span>
);

const mobileTab =
  "flex flex-col items-center justify-center gap-1 w-full h-full min-h-[44px] rounded-[16px] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-free)]";
const sheetRow =
  "flex items-center gap-3 min-h-[48px] px-3 rounded-[8px] font-inter text-[15px] font-medium transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-free)]";

export const AppLayout = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const onMoreRoute = MORE_ROUTES.some((r) => pathname.startsWith(r));

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
            <Wordmark />
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
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]"
                    )
                  }
                >
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Mobile wordmark — the tab bar carries the navigation. */}
      <header className="sm:hidden max-w-[960px] w-full mx-auto px-4 pt-4">
        <Wordmark />
      </header>

      {/* Main Content Area */}
      <main id="main" tabIndex={-1} className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 py-6 pb-32 sm:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Tab Bar */}
      {/* Floats above the page with a blur behind it (Design Brief 10). */}
      <nav
        aria-label="Primary"
        className="sm:hidden fixed inset-x-3 z-10 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-tabbar)] backdrop-blur-md shadow-[0_10px_30px_-12px_rgb(0_0_0/0.3)]"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] items-center h-16 p-1.5 gap-1">
          {navItems
            .filter((item) => MOBILE_TABS.includes(item.to))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(mobileTab, isActive ? "text-[var(--color-free)] bg-[var(--color-free-tint)]" : "text-[var(--color-ink-muted)]")
                }
              >
                <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="text-[10px] font-inter font-medium">{item.label}</span>
              </NavLink>
            ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(mobileTab, onMoreRoute ? "text-[var(--color-free)]" : "text-[var(--color-ink-muted)]")}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] font-inter font-medium">More</span>
          </button>
        </div>
      </nav>

      <Modal isOpen={moreOpen} onClose={closeMore} title="More" className="sm:hidden">
        <ul className="-mx-2 space-y-1">
          {navItems
            .filter((item) => MORE_ROUTES.includes(item.to))
            .map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={closeMore}
                  className={({ isActive }) => cn(sheetRow, isActive ? "text-[var(--color-free)] bg-[var(--color-free-tint)]" : "text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]")}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          <li className="pt-2 mt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => {
                closeMore();
                handleLogout();
              }}
              className={cn(sheetRow, "w-full text-[var(--color-error)] hover:bg-[var(--color-surface-soft)]")}
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
              Logout
            </button>
          </li>
        </ul>
      </Modal>
    </div>
  );
};
