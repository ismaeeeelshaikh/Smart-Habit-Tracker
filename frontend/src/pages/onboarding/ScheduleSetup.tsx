import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { ScheduleList } from '../../components/schedule/ScheduleList';
import { getScheduleBlocks, createScheduleBlock, updateScheduleBlock, deleteScheduleBlock } from '../../api';
import type { ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate, DayOfWeek } from '../../types';

export const ScheduleSetup = () => {
  const navigate = useNavigate();
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

      <div className="flex justify-between items-center pt-8 border-t border-[var(--color-border)]">
        <button 
          className="text-[15px] font-inter text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          onClick={() => navigate('/onboarding/goals')}
        >
          Skip for now
        </button>
        <Button onClick={() => navigate('/onboarding/goals')}>
          Continue
        </Button>
      </div>
    </div>
  );
};
