import { Card } from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';

export const Settings = () => {
  useAuth();

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-2xl mx-auto">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Settings</h1>
      </header>

      <Card className="p-6 space-y-4">
        <h2 className="font-display font-semibold text-[18px]">Account</h2>
        <div className="text-[15px] font-inter">
          <span className="text-[var(--color-ink-muted)]">Email: </span>
          <span>user@example.com</span>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-display font-semibold text-[18px]">Telegram</h2>
        <div className="bg-[var(--color-warning-bg)] p-4 rounded-[8px] text-[15px] font-inter text-[var(--color-ink)]">
          You haven't connected Telegram yet. Reminders won't be delivered.
        </div>
        {/* Placeholder for connection flow */}
      </Card>
    </div>
  );
};
