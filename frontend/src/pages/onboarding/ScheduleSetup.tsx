import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { ScheduleList } from '../../components/schedule/ScheduleList';
import { useScheduleBlocks } from '../../hooks/useScheduleBlocks';
import type { DayOfWeek, ScheduleBlockCreate } from '../../types';

export const ScheduleSetup = () => {
  const navigate = useNavigate();
  const { blocks, isLoading, error, addBlock, editBlock, removeBlock } = useScheduleBlocks();

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-8 animate-in fade-in duration-300 mb-12">
      <div className="text-[13px] font-inter text-[var(--color-ink-muted)] font-medium">
        Step 1 of 3: Your Weekly Schedule
      </div>

      <header>
        <h1 className="font-display font-semibold text-[24px]">When are you busy?</h1>
        <p className="text-[var(--color-ink-muted)] mt-2">
          Add your fixed commitments so we know when you're free.
        </p>
      </header>

      {error && <p className="text-[var(--color-error)] font-medium">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-free)]" />
        </div>
      ) : (
        <ScheduleList
          blocks={blocks}
          onAddBlock={(_day: DayOfWeek, data: ScheduleBlockCreate) => addBlock(data)}
          onEditBlock={editBlock}
          onDeleteBlock={removeBlock}
        />
      )}

      <div className="flex justify-between items-center pt-8 border-t border-[var(--color-border)]">
        <button
          className="text-[15px] font-inter text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          onClick={() => navigate('/onboarding/goals')}
        >
          Skip for now
        </button>
        <Button onClick={() => navigate('/onboarding/goals')}>Continue</Button>
      </div>
    </div>
  );
};
