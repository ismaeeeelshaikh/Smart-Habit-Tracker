import { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { WeekStrip } from '../components/WeekStrip';
import type { DaySchedule, TimeBlock } from '../components/WeekStrip';
import { useAuth } from '../contexts/AuthContext';
import { getScheduleBlocks } from '../api';
import type { DayOfWeek } from '../types';

export const Dashboard = () => {
  useAuth();
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndMapSchedule = async () => {
      try {
        const blocks = await getScheduleBlocks();
        
        const days: { id: DayOfWeek; name: string }[] = [
          { id: 'mon', name: 'MON' },
          { id: 'tue', name: 'TUE' },
          { id: 'wed', name: 'WED' },
          { id: 'thu', name: 'THU' },
          { id: 'fri', name: 'FRI' },
          { id: 'sat', name: 'SAT' },
          { id: 'sun', name: 'SUN' },
        ];

        const mappedSchedule: DaySchedule[] = days.map(day => {
          const dayBlocks = blocks.filter(b => b.day_of_week === day.id && !b.is_flexible_block && b.start_time && b.end_time);
          
          const timeBlocks: TimeBlock[] = dayBlocks.map(b => {
            const [sHour, sMin] = b.start_time!.split(':').map(Number);
            const [eHour, eMin] = b.end_time!.split(':').map(Number);
            return {
              id: b.id,
              type: 'committed',
              label: b.label,
              startMinutes: sHour * 60 + sMin,
              endMinutes: eHour * 60 + eMin,
            };
          });

          return {
            dayName: day.name,
            blocks: timeBlocks
          };
        });

        setSchedule(mappedSchedule);
      } catch (err) {
        console.error("Failed to fetch schedule for dashboard", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndMapSchedule();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="font-display font-semibold text-[var(--color-ink)] text-2xl">
            Hi 👋
          </h1>
          <p className="text-[var(--color-ink-muted)] font-inter mt-1">Here is your time intelligence for today.</p>
        </div>
      </header>

      {/* Telegram Banner Placeholder */}
      <div className="bg-[var(--color-warning-bg)] p-4 rounded-[10px] text-[15px] font-inter text-[var(--color-ink)]">
        You haven't connected Telegram yet — reminders won't be delivered. <a href="/settings" className="font-medium underline hover:text-[var(--color-free)]">Connect now</a>
      </div>

      {/* Signature Week Strip */}
      <section>
        <h2 className="font-display font-semibold text-[18px] mb-4">Your Week</h2>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center border border-border rounded-md">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <WeekStrip schedule={schedule} size="compact" />
        )}
      </section>

      {/* Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-display font-semibold text-[18px] mb-4">Today's Free Slots</h3>
          <div className="text-[var(--color-ink-muted)] text-[13px]">
            No free time today — enjoy your full schedule!
          </div>
        </Card>
        
        <Card className="p-6">
          <h3 className="font-display font-semibold text-[18px] mb-4">Next Suggested Task</h3>
          <div className="text-[var(--color-ink-muted)] text-[13px]">
            Add a goal to get personalized suggestions.
          </div>
        </Card>
      </div>
    </div>
  );
};
