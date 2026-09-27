import { updatePreferences } from '../api';
import { QuietDays } from '../components/schedule/QuietDays';
import { DescribeWeek } from '../components/schedule/DescribeWeek';
import { ScheduleList } from '../components/schedule/ScheduleList';
import { useAuth } from '../contexts/AuthContext';
import { useScheduleBlocks } from '../hooks/useScheduleBlocks';
import { toMinutes } from '../utils/time';
import type { DayOfWeek, ScheduleBlockCreate } from '../types';

export const Schedule = () => {
  const { blocks, isLoading, error, refetch, addBlock, editBlock, removeBlock } = useScheduleBlocks();
  const { user, refreshUser } = useAuth();
  const quietDays = user?.quiet_days ?? [];

  const windowStart = toMinutes(user?.day_start_time ?? '06:00:00');
  const windowEnd = toMinutes(user?.day_end_time ?? '23:00:00');

  const saveQuietDays = async (days: DayOfWeek[]) => {
    await updatePreferences({ quiet_days: days });
    await refreshUser();
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300 max-w-[720px] mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[26px] leading-[32px] sm:text-[28px] text-[var(--color-ink)]">
          Schedule
        </h1>
        <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">Your week, Monday to Sunday</p>
      </header>

      {error && <p className="text-[var(--color-error)] font-medium">{error}</p>}

      <DescribeWeek onSaved={refetch} />

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
          quietDays={quietDays}
          windowStart={windowStart}
          windowEnd={windowEnd}
        />
      )}

      <QuietDays quietDays={quietDays} onChangeQuietDays={saveQuietDays} />
    </div>
  );
};
