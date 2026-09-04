import { ScheduleList } from '../components/schedule/ScheduleList';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import type { DayOfWeek, ScheduleBlockCreate } from '../types';

export const Schedule = () => {
  const { blocks, isLoading, error, addBlock, editBlock, removeBlock } = useScheduleBlocks();

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Schedule</h1>
        <p className="text-[var(--color-ink-muted)]">Manage your weekly commitments.</p>
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
    </div>
  );
};
