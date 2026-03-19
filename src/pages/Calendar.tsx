import React, { useState, useEffect } from 'react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays,
  parseISO
} from 'date-fns';
import { ChevronLeft, ChevronRight, X, Dumbbell, Save, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const MUSCLE_GROUPS = [
  'Chest (胸部)', 'Back (背部)', 'Legs (腿部)', 
  'Shoulders (肩部)', 'Arms (手臂)', 'Core (核心)', 
  'Cardio (有氧)', 'Full Body (全身)'
];

interface WorkoutLog {
  id?: string;
  date: string;
  muscles: string[];
  exercises: string;
}

export default function Calendar() {
  const { user } = useAuthStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<Record<string, WorkoutLog>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [exercisesText, setExercisesText] = useState('');

  // Fetch logs for the current month
  useEffect(() => {
    if (!user) return;

    const fetchLogs = async () => {
      setLoading(true);
      const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      if (error) {
        console.error('Error fetching workout logs:', error);
      } else if (data) {
        const logsMap: Record<string, WorkoutLog> = {};
        data.forEach((log) => {
          logsMap[log.date] = log;
        });
        setLogs((prev) => ({ ...prev, ...logsMap }));
      }
      setLoading(false);
    };

    fetchLogs();
  }, [currentDate, user]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const onDateClick = (day: Date) => {
    setSelectedDate(day);
    const dateStr = format(day, 'yyyy-MM-dd');
    const existingLog = logs[dateStr];
    
    if (existingLog) {
      setSelectedMuscles(existingLog.muscles || []);
      setExercisesText(existingLog.exercises || '');
    } else {
      setSelectedMuscles([]);
      setExercisesText('');
    }
    
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !selectedDate) return;
    
    setSaving(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Create the payload without the id to let upsert handle it
    const payload = {
      user_id: user.id,
      date: dateStr,
      muscles: selectedMuscles,
      exercises: exercisesText,
      updated_at: new Date().toISOString(),
    };
    
    // Add id if we are updating an existing log
    if (logs[dateStr] && logs[dateStr].id) {
      (payload as any).id = logs[dateStr].id;
    }

    const { data, error } = await supabase
      .from('workout_logs')
      .upsert(payload, { onConflict: 'user_id, date' })
      .select()
      .single();

    if (error) {
      console.error('Error saving workout log:', error);
      alert(`保存失败: ${error.message}`);
    } else if (data) {
      setLogs(prev => ({
        ...prev,
        [dateStr]: data
      }));
      setIsModalOpen(false);
    }
    setSaving(false);
  };

  const toggleMuscle = (muscle: string) => {
    setSelectedMuscles(prev => 
      prev.includes(muscle) 
        ? prev.filter(m => m !== muscle)
        : [...prev, muscle]
    );
  };

  const renderHeader = () => {
    return (
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">
          {format(currentDate, 'yyyy年 MM月')}
        </h2>
        <div className="flex space-x-2">
          <button onClick={prevMonth} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={nextMonth} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return (
      <div className="grid grid-cols-7 mb-2">
        {days.map((day, i) => (
          <div key={i} className="text-center font-medium text-sm text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = '';

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, 'd');
        const cloneDay = day;
        const dateStr = format(day, 'yyyy-MM-dd');
        const hasLog = logs[dateStr] && (logs[dateStr].muscles?.length > 0 || logs[dateStr].exercises?.length > 0);
        const isToday = isSameDay(day, new Date());

        days.push(
          <div
            key={day.toString()}
            onClick={() => onDateClick(cloneDay)}
            className={`
              min-h-[100px] p-2 border border-gray-100 cursor-pointer transition-colors
              ${!isSameMonth(day, monthStart) ? 'bg-gray-50 text-gray-400' : 'bg-white hover:bg-orange-50'}
              ${isSameDay(day, selectedDate || new Date(0)) ? 'ring-2 ring-orange-400 ring-inset' : ''}
            `}
          >
            <div className="flex justify-between items-start">
              <span className={`
                text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-orange-500 text-white' : 'text-gray-700'}
              `}>
                {formattedDate}
              </span>
              {hasLog && <Dumbbell className="w-4 h-4 text-orange-500" />}
            </div>
            
            {hasLog && (
              <div className="mt-2 flex flex-wrap gap-1">
                {logs[dateStr].muscles?.slice(0, 2).map((m, idx) => (
                  <span key={idx} className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded">
                    {m.split(' ')[0]}
                  </span>
                ))}
                {logs[dateStr].muscles?.length > 2 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                    +{logs[dateStr].muscles.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">{rows}</div>;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">训练日历</h1>
          <p className="text-gray-500 mt-1">记录你每天的训练部位和动作</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded-xl">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        )}
        {renderHeader()}
        {renderDays()}
        {renderCells()}
      </div>

      {/* Modal for recording workout */}
      {isModalOpen && selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">
                {format(selectedDate, 'yyyy年MM月dd日')} 训练记录
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  训练部位 (多选)
                </label>
                <div className="flex flex-wrap gap-2">
                  {MUSCLE_GROUPS.map(muscle => {
                    const isSelected = selectedMuscles.includes(muscle);
                    return (
                      <button
                        key={muscle}
                        onClick={() => toggleMuscle(muscle)}
                        className={`
                          px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                          ${isSelected 
                            ? 'bg-orange-500 text-white border-transparent' 
                            : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300 hover:bg-orange-50'}
                        `}
                      >
                        {muscle}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  训练动作及备注
                </label>
                <textarea
                  value={exercisesText}
                  onChange={(e) => setExercisesText(e.target.value)}
                  placeholder="例如：&#10;1. 杠铃卧推 4组x8次 60kg&#10;2. 哑铃飞鸟 3组x12次 15kg&#10;状态不错，突破了重量！"
                  className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm"
                ></textarea>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                保存记录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
