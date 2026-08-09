import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export const TelegramLink = () => {
  const navigate = useNavigate();

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

      <div className="py-8 border-b border-[var(--color-border)] flex flex-col items-center justify-center space-y-4">
        <Button>Generate linking code</Button>
      </div>

      <div className="flex justify-between items-center pt-4">
        <button 
          className="text-[15px] font-inter text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Skip for now
        </button>
        <Button disabled onClick={() => navigate('/dashboard')}>
          Finish setup
        </Button>
      </div>
    </div>
  );
};
