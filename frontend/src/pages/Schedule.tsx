import { useEffect, useState } from 'react';
import { ScheduleList } from '../components/schedule/ScheduleList';
import { getScheduleBlocks, createScheduleBlock, updateScheduleBlock, deleteScheduleBlock } from '../api';
import type { ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate, DayOfWeek } from '../types';

export const Schedule = () => {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBlocks = async () => {
    try {
      const data = await getScheduleBlocks();
      setBlocks(data);
    } catch (err: any) {
      setError('Failed to load schedule. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  const handleAdd = async (_day: DayOfWeek, data: ScheduleBlockCreate) => {
    const newBlock = await createScheduleBlock(data);
    setBlocks(prev => [...prev, newBlock]);
  };

  const handleEdit = async (id: string, data: ScheduleBlockUpdate) => {
    const updatedBlock = await updateScheduleBlock(id, data);
    setBlocks(prev => prev.map(b => (b.id === id ? updatedBlock : b)));
  };

  const handleDelete = async (id: string) => {
    await deleteScheduleBlock(id);
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto mb-12">
      <header>
        <h1 className="font-display font-semibold text-[24px]">Schedule</h1>
        <p className="text-[var(--color-ink-muted)]">Manage your weekly commitments.</p>
      </header>

      {error && <p className="text-destructive font-medium">{error}</p>}

      {isLoading ? (
        <div className="flex justify-center p-8">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <ScheduleList 
          blocks={blocks} 
          onAddBlock={handleAdd} 
          onEditBlock={handleEdit} 
          onDeleteBlock={handleDelete} 
        />
      )}
    </div>
  );
};
