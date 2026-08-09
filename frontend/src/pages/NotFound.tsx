import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

export const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--color-bg)]">
      <h1 className="font-display font-semibold text-[32px] text-[var(--color-ink)] mb-2">404</h1>
      <p className="font-inter text-[15px] text-[var(--color-ink-muted)] mb-6 text-center">
        Page not found. It might have been moved or doesn't exist.
      </p>
      <Button onClick={() => navigate('/dashboard')}>
        Go to Dashboard
      </Button>
    </div>
  );
};
