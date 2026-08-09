import { EmptyState } from '../components/ui/EmptyState';

export const Stats = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Stats</h1>
        <p className="text-[var(--color-ink-muted)]">Weekly completion statistics.</p>
      </header>
      
      <EmptyState 
        message="No activity recorded yet this week." 
      />
    </div>
  );
};
