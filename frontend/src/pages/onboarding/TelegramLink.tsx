import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { completeOnboarding } from '../../api';

export const TelegramLink = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState('');

  const finish = async () => {
    setError('');
    setIsFinishing(true);
    try {
      await completeOnboarding();
      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Could not finish setup. Please try again.');
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-8 animate-in fade-in duration-300">
      <div className="text-[13px] font-inter text-[var(--color-ink-muted)] font-medium">
        Step 3 of 3: Connect Telegram
      </div>

      <header>
        <h1 className="font-display font-semibold text-[24px]">Connect Telegram</h1>
        <p className="text-[var(--color-ink-muted)] mt-2">
          Reminders are delivered via Telegram. Connect your account to get started.
        </p>
      </header>

      {error && <p className="text-[13px] text-[var(--color-error)]">{error}</p>}

      <div className="py-8 border-b border-[var(--color-border)] flex flex-col items-center justify-center space-y-4">
        {/* Code generation + status polling arrive in Phase 6 with the bot. */}
        <Button disabled title="Available once the bot is connected">
          Generate linking code
        </Button>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You can connect Telegram later from Settings.
        </p>
      </div>

      <div className="flex justify-between items-center pt-4">
        <button
          className="text-[15px] font-inter text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          onClick={finish}
          disabled={isFinishing}
        >
          Skip for now
        </button>
        <Button onClick={finish} disabled={isFinishing}>
          {isFinishing ? 'Finishing…' : 'Finish setup'}
        </Button>
      </div>
    </div>
  );
};
