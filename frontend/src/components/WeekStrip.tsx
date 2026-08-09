import React from 'react';
import { cn } from '../utils/cn';

export interface TimeBlock {
  id: string;
  type: 'committed' | 'free';
  label?: string;
  startMinutes: number; // minutes from start of day (e.g. 6AM = 360)
  endMinutes: number;
}

export interface DaySchedule {
  dayName: string; // e.g. 'MON'
  blocks: TimeBlock[];
}

interface WeekStripProps {
  schedule: DaySchedule[];
  startOfDayMinutes?: number; // default 6:00 AM = 360
  endOfDayMinutes?: number; // default 11:00 PM = 1380
  className?: string;
  size?: 'compact' | 'expanded';
}

export const WeekStrip: React.FC<WeekStripProps> = ({
  schedule,
  startOfDayMinutes = 360,
  endOfDayMinutes = 1380,
  className,
  size = 'compact'
}) => {
  const totalMinutes = endOfDayMinutes - startOfDayMinutes;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="min-w-[600px] w-full flex space-x-2">
        {schedule.map((day, i) => (
          <div key={i} className="flex-1 flex flex-col">
            <div className="text-center mb-2 font-display text-[13px] uppercase tracking-wider text-[var(--color-ink-muted)]">
              {day.dayName}
            </div>
            
            <div className={cn(
              "relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md overflow-hidden",
              size === 'compact' ? 'h-[200px]' : 'h-[400px]'
            )}>
              {day.blocks.map(block => {
                // Ensure block fits within visible window
                const start = Math.max(startOfDayMinutes, block.startMinutes);
                const end = Math.min(endOfDayMinutes, block.endMinutes);
                
                if (end <= start) return null; // Outside visible window
                
                const topPercent = ((start - startOfDayMinutes) / totalMinutes) * 100;
                const heightPercent = ((end - start) / totalMinutes) * 100;
                
                return (
                  <div
                    key={block.id}
                    className={cn(
                      "absolute left-0 right-0 mx-1 rounded-[6px] transition-transform hover:scale-[1.02] cursor-pointer",
                      block.type === 'committed'
                        ? "bg-[var(--color-committed)] z-10"
                        : "bg-[var(--color-free-tint)] border border-[var(--color-free)] z-0"
                    )}
                    style={{
                      top: `${topPercent}%`,
                      height: `${heightPercent}%`,
                    }}
                    title={block.label}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
