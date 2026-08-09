import { EmptyState } from '../components/ui/EmptyState';

export const Reminders = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="font-display font-semibold text-[24px]">Reminders</h1>
          <p className="text-[var(--color-ink-muted)]">View your reminder history and status.</p>
        </div>
      </header>
      
      <EmptyState 
        message="No reminders match this filter." 
        actionLabel="Add manual reminder"
        onAction={() => {}}
      />
    </div>
  );
};
