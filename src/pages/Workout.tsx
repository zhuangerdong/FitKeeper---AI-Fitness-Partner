import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Plus, ChevronRight, Play, Pause, Trash2, Activity, Clock, Target, TrendingUp, RotateCcw, Flame, MessageCircle, Edit3, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

interface Exercise {
  name: string;
  type?: string;
  primary_muscle?: string;
  sets: number;
  reps: string;
  intensity?: string;
  rest_seconds?: number;
  notes?: string;
  progression_method?: string;
  alternative_exercises?: string[];
}

interface DaySchedule {
  day: string;
  day_type?: string;
  focus: string;
  exercises: Exercise[];
}

interface WeeklyVolumeSummary {
  chest_sets?: number;
  back_sets?: number;
  shoulders_sets?: number;
  biceps_sets?: number;
  triceps_sets?: number;
  quads_sets?: number;
  hamstrings_sets?: number;
  glutes_sets?: number;
}

interface DeloadSchedule {
  deload_week: number;
  method: 'volume_deload' | 'intensity_deload' | 'full_deload';
}

interface WorkoutPlan {
  id: string;
  plan_name: string;
  goal?: string;
  difficulty_level: string;
  days_per_week: number;
  exercises_schedule: DaySchedule[];
  periodization_type?: string;
  mesocycle_length_weeks?: number;
  weekly_volume_summary?: WeeklyVolumeSummary;
  deload_schedule?: DeloadSchedule;
  progression_plan?: string;
  warmup_guidance?: string;
  recovery_notes?: string;
  is_active: boolean;
  start_date: string;
  created_at: string;
}

export default function Workout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
  
  // Custom plan creation state
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customPlanName, setCustomPlanName] = useState('');
  const [customPlanDays, setCustomPlanDays] = useState(3);
  const [savingCustom, setSavingCustom] = useState(false);

  // 加载所有 plans
  useEffect(() => {
    if (user?.id) {
      loadPlans();
    }
  }, [user?.id]);

  const loadPlans = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setPlans(data);
    setLoading(false);
  };

  // 开始咨询 - 跳转到 Chat 页面并创建新 session
  const startConsultation = () => {
    // 如果已经在 Chat 页面，强制刷新页面
    if (window.location.pathname === '/chat') {
      // 保存状态到 sessionStorage，刷新后读取
      sessionStorage.setItem('pendingConsultation', JSON.stringify({
        initialMessage: '我想创建一个训练计划',
        createNewSession: true
      }));
      window.location.reload();
    } else {
      navigate('/chat', { 
        state: { 
          initialMessage: '我想创建一个训练计划',
          createNewSession: true
        } 
      });
    }
  };

  // 激活/停用计划
  const togglePlanActive = async (planId: string, makeActive: boolean) => {
    if (makeActive) {
      // 先停用所有其他计划
      await supabase
        .from('workout_plans')
        .update({ is_active: false })
        .eq('user_id', user!.id);
    }

    const { error } = await supabase
      .from('workout_plans')
      .update({ is_active: makeActive })
      .eq('id', planId);

    if (!error) {
      setPlans(plans.map(p => ({
        ...p,
        is_active: p.id === planId ? makeActive : (makeActive ? false : p.is_active)
      })));
      if (selectedPlan?.id === planId) {
        setSelectedPlan({ ...selectedPlan, is_active: makeActive });
      }
    }
  };

  // 删除计划
  const deletePlan = async (planId: string) => {
    if (!confirm('确定要删除这个训练计划吗？')) return;
    
    const { error } = await supabase
      .from('workout_plans')
      .delete()
      .eq('id', planId);

    if (!error) {
      setPlans(plans.filter(p => p.id !== planId));
      if (selectedPlan?.id === planId) {
        setSelectedPlan(null);
      }
    }
  };

  const getDifficultyLabel = (level: string) => {
    const labels: Record<string, string> = {
      beginner: '初级',
      intermediate: '中级',
      advanced: '高级',
    };
    return labels[level] || level;
  };

  const getGoalLabel = (goal?: string) => {
    const labels: Record<string, string> = {
      hypertrophy: '增肌',
      strength: '力量',
      powerbuilding: '力量+形体',
      fat_loss: '减脂塑形',
      general: '一般健身',
    };
    return goal ? labels[goal] || goal : '';
  };

  const getPeriodizationLabel = (type?: string) => {
    const labels: Record<string, string> = {
      linear: '线性周期化',
      daily_undulating: '每日波动周期化',
      weekly_undulating: '每周波动周期化',
      block: '板块周期化',
    };
    return type ? labels[type] || type : null;
  };

  // 创建自定义计划
  const handleCreateCustomPlan = async () => {
    if (!user || !customPlanName.trim()) {
      alert('请输入计划名称');
      return;
    }
    
    setSavingCustom(true);
    
    // 初始化空的训练日
    const exercises_schedule: DaySchedule[] = Array.from({ length: customPlanDays }).map((_, i) => ({
      day: `第 ${i + 1} 天`,
      focus: '全身',
      exercises: []
    }));

    const newPlan = {
      user_id: user.id,
      plan_name: customPlanName,
      difficulty_level: 'intermediate',
      days_per_week: customPlanDays,
      exercises_schedule,
      is_active: false,
      start_date: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('workout_plans')
      .insert(newPlan)
      .select()
      .single();

    if (error) {
      console.error('Error creating custom plan:', error);
      alert('创建失败: ' + error.message);
    } else if (data) {
      setPlans([data, ...plans]);
      setIsCreatingCustom(false);
      setCustomPlanName('');
      setSelectedPlan(data); // 自动打开新建的计划
    }
    setSavingCustom(false);
  };

  // 添加动作到某一天
  const handleAddExercise = (dayIndex: number) => {
    if (!selectedPlan) return;
    
    const newExercise: Exercise = {
      name: '新动作',
      sets: 3,
      reps: '8-12',
    };

    const updatedSchedule = [...selectedPlan.exercises_schedule];
    updatedSchedule[dayIndex].exercises.push(newExercise);

    updatePlanSchedule(updatedSchedule);
  };

  // 删除某天的动作
  const handleRemoveExercise = (dayIndex: number, exerciseIndex: number) => {
    if (!selectedPlan) return;
    
    const updatedSchedule = [...selectedPlan.exercises_schedule];
    updatedSchedule[dayIndex].exercises.splice(exerciseIndex, 1);

    updatePlanSchedule(updatedSchedule);
  };

  // 更新动作内容
  const handleUpdateExercise = (dayIndex: number, exerciseIndex: number, field: keyof Exercise, value: any) => {
    if (!selectedPlan) return;
    
    const updatedSchedule = [...selectedPlan.exercises_schedule];
    updatedSchedule[dayIndex].exercises[exerciseIndex] = {
      ...updatedSchedule[dayIndex].exercises[exerciseIndex],
      [field]: value
    };

    updatePlanSchedule(updatedSchedule);
  };

  // 更新天数标题/重点
  const handleUpdateDay = (dayIndex: number, field: 'day' | 'focus', value: string) => {
    if (!selectedPlan) return;
    
    const updatedSchedule = [...selectedPlan.exercises_schedule];
    updatedSchedule[dayIndex] = {
      ...updatedSchedule[dayIndex],
      [field]: value
    };

    updatePlanSchedule(updatedSchedule);
  };

  // 保存计划更改到数据库
  const updatePlanSchedule = async (newSchedule: DaySchedule[]) => {
    if (!selectedPlan) return;

    // 先乐观更新 UI
    const updatedPlan = { ...selectedPlan, exercises_schedule: newSchedule };
    setSelectedPlan(updatedPlan);
    setPlans(plans.map(p => p.id === updatedPlan.id ? updatedPlan : p));

    // 延迟保存到数据库
    const { error } = await supabase
      .from('workout_plans')
      .update({ exercises_schedule: newSchedule })
      .eq('id', selectedPlan.id);

    if (error) {
      console.error('Error updating plan:', error);
      alert('自动保存失败');
    }
  };

  // 详情视图
  if (selectedPlan) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 返回按钮 */}
        <button
          onClick={() => setSelectedPlan(null)}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
          返回计划列表
        </button>

        {/* 计划头部 */}
        <div className="bg-white rounded-lg shadow p-4 md:p-6">
          <div className="space-y-4">
            <div className="md:flex md:justify-between md:items-start">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">{selectedPlan.plan_name}</h1>
                <div className="flex flex-wrap gap-2 md:gap-4 mt-2 text-xs md:text-sm text-gray-500">
                  <span className="inline-flex items-center">
                    <Target className="h-3.5 w-3.5 mr-1" />
                    {getDifficultyLabel(selectedPlan.difficulty_level)}
                  </span>
                  {selectedPlan.goal && (
                    <span className="inline-flex items-center">
                      <Flame className="h-3.5 w-3.5 mr-1 text-orange-500" />
                      {getGoalLabel(selectedPlan.goal)}
                    </span>
                  )}
                  <span>每周 {selectedPlan.days_per_week} 天</span>
                  <span>创建于 {format(new Date(selectedPlan.created_at), 'yyyy-MM-dd')}</span>
                </div>
              </div>
              <div className="flex gap-2 mt-3 md:mt-0">
                <button
                  onClick={() => togglePlanActive(selectedPlan.id, !selectedPlan.is_active)}
                  className={`flex-1 md:flex-none inline-flex items-center justify-center px-3 md:px-4 py-2 rounded-md text-sm font-medium ${
                    selectedPlan.is_active
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {selectedPlan.is_active ? (
                    <>
                      <Pause className="h-4 w-4 mr-1.5" />
                      停止使用
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1.5" />
                      开始使用
                    </>
                  )}
                </button>
                <button
                  onClick={() => deletePlan(selectedPlan.id)}
                  className="inline-flex items-center justify-center px-3 md:px-4 py-2 rounded-md text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200"
                >
                  <Trash2 className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">删除</span>
                </button>
              </div>
            </div>

            {/* 科学训练信息卡片 */}
            {(selectedPlan.periodization_type || selectedPlan.mesocycle_length_weeks || selectedPlan.deload_schedule || selectedPlan.progression_plan) && (
              <div className="border-t pt-4 mt-4 grid gap-4 md:grid-cols-2">
                {/* 周期化信息 */}
                {selectedPlan.periodization_type && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center text-blue-800 mb-1">
                      <TrendingUp className="h-4 w-4 mr-1.5" />
                      <span className="font-medium text-sm">周期化方式</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      {getPeriodizationLabel(selectedPlan.periodization_type)}
                      {selectedPlan.mesocycle_length_weeks && ` (${selectedPlan.mesocycle_length_weeks}周周期)`}
                    </p>
                  </div>
                )}

                {/* 减载安排 */}
                {selectedPlan.deload_schedule && (
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="flex items-center text-green-800 mb-1">
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      <span className="font-medium text-sm">减载安排</span>
                    </div>
                    <p className="text-sm text-green-700">
                      第{selectedPlan.deload_schedule.deload_week}周 - {getDeloadMethodLabel(selectedPlan.deload_schedule.method)}
                    </p>
                  </div>
                )}

                {/* 渐进超负荷 */}
                {selectedPlan.progression_plan && (
                  <div className="bg-purple-50 rounded-lg p-3 md:col-span-2">
                    <div className="flex items-center text-purple-800 mb-1">
                      <TrendingUp className="h-4 w-4 mr-1.5" />
                      <span className="font-medium text-sm">渐进超负荷</span>
                    </div>
                    <p className="text-sm text-purple-700">{selectedPlan.progression_plan}</p>
                  </div>
                )}

                {/* 每周容量 */}
                {selectedPlan.weekly_volume_summary && (
                  <div className="bg-gray-50 rounded-lg p-3 md:col-span-2">
                    <div className="flex items-center text-gray-800 mb-2">
                      <Activity className="h-4 w-4 mr-1.5" />
                      <span className="font-medium text-sm">每周训练容量（组数）</span>
                    </div>
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-2 text-xs">
                      {selectedPlan.weekly_volume_summary.chest_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.chest_sets}</div>
                          <div className="text-gray-500">胸部</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.back_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.back_sets}</div>
                          <div className="text-gray-500">背部</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.shoulders_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.shoulders_sets}</div>
                          <div className="text-gray-500">肩部</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.biceps_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.biceps_sets}</div>
                          <div className="text-gray-500">二头</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.triceps_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.triceps_sets}</div>
                          <div className="text-gray-500">三头</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.quads_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.quads_sets}</div>
                          <div className="text-gray-500">股四</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.hamstrings_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.hamstrings_sets}</div>
                          <div className="text-gray-500">腘绳</div>
                        </div>
                      )}
                      {selectedPlan.weekly_volume_summary.glutes_sets !== undefined && (
                        <div className="text-center">
                          <div className="font-bold text-gray-900">{selectedPlan.weekly_volume_summary.glutes_sets}</div>
                          <div className="text-gray-500">臀部</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 恢复建议 */}
                {selectedPlan.recovery_notes && (
                  <div className="bg-amber-50 rounded-lg p-3 md:col-span-2">
                    <div className="flex items-center text-amber-800 mb-1">
                      <span className="font-medium text-sm">💡 恢复建议</span>
                    </div>
                    <p className="text-sm text-amber-700">{selectedPlan.recovery_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 每日训练 */}
        <div className="grid gap-4 md:gap-6 md:grid-cols-2">
          {selectedPlan.exercises_schedule.map((day, dayIndex) => (
            <div key={dayIndex} className="bg-white rounded-lg shadow overflow-hidden relative group">
              <div className={`px-4 py-3 border-b flex justify-between items-center ${
                day.day_type === 'strength' ? 'bg-red-50 border-red-100' :
                day.day_type === 'hypertrophy' ? 'bg-blue-50 border-blue-100' :
                day.day_type === 'power' ? 'bg-purple-50 border-purple-100' :
                'bg-orange-50 border-orange-100'
              }`}>
                <input
                  type="text"
                  value={day.day}
                  onChange={(e) => handleUpdateDay(dayIndex, 'day', e.target.value)}
                  className="font-medium bg-transparent border-none focus:ring-0 p-0 text-sm md:text-base text-gray-900 w-24 md:w-32"
                />
                <input
                  type="text"
                  value={day.focus}
                  onChange={(e) => handleUpdateDay(dayIndex, 'focus', e.target.value)}
                  className={`text-xs font-medium px-2 py-1 rounded-full text-center border-none bg-white/50 focus:ring-2 focus:ring-orange-200 w-24 md:w-32 ${
                    day.day_type === 'strength' ? 'text-red-800' :
                    day.day_type === 'hypertrophy' ? 'text-blue-800' :
                    day.day_type === 'power' ? 'text-purple-800' :
                    'text-orange-800'
                  }`}
                />
              </div>
              <div className="p-4">
                <ul className="space-y-4">
                  {day.exercises.map((exercise, idx) => (
                    <li key={idx} className="relative group/item bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <button 
                        onClick={() => handleRemoveExercise(dayIndex, idx)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      
                      <div className="pr-6">
                        <input
                          type="text"
                          value={exercise.name}
                          onChange={(e) => handleUpdateExercise(dayIndex, idx, 'name', e.target.value)}
                          placeholder="动作名称"
                          className="font-medium text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:border-orange-500 focus:ring-0 p-0 w-full mb-2"
                        />
                        
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-1">组数</label>
                            <div className="flex items-center bg-white rounded border px-2 py-1">
                              <input
                                type="number"
                                value={exercise.sets}
                                onChange={(e) => handleUpdateExercise(dayIndex, idx, 'sets', parseInt(e.target.value) || 0)}
                                className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 text-center"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-1">次数</label>
                            <div className="flex items-center bg-white rounded border px-2 py-1">
                              <input
                                type="text"
                                value={exercise.reps}
                                onChange={(e) => handleUpdateExercise(dayIndex, idx, 'reps', e.target.value)}
                                className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 text-center"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-1">休息(秒)</label>
                            <div className="flex items-center bg-white rounded border px-2 py-1">
                              <input
                                type="number"
                                value={exercise.rest_seconds || ''}
                                onChange={(e) => handleUpdateExercise(dayIndex, idx, 'rest_seconds', parseInt(e.target.value) || null)}
                                placeholder="--"
                                className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 text-center"
                              />
                            </div>
                          </div>
                        </div>
                        
                        <input
                          type="text"
                          value={exercise.notes || ''}
                          onChange={(e) => handleUpdateExercise(dayIndex, idx, 'notes', e.target.value)}
                          placeholder="添加备注 (选填)"
                          className="text-xs text-gray-500 bg-transparent border-none focus:ring-0 p-0 w-full mt-2 placeholder-gray-300"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                
                <button
                  onClick={() => handleAddExercise(dayIndex)}
                  className="mt-4 w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-colors flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 mr-1" /> 添加动作
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">训练计划</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setIsCreatingCustom(true)}
            className="inline-flex items-center px-3 md:px-4 py-2 border border-orange-200 rounded-md shadow-sm text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100"
          >
            <Edit3 className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">自定义</span>计划
          </button>
          <button
            onClick={startConsultation}
            className="inline-flex items-center px-3 md:px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
          >
            <MessageCircle className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">AI </span>生成
          </button>
        </div>
      </div>

      {/* 创建自定义计划表单 */}
      {isCreatingCustom && (
        <div className="bg-white rounded-lg shadow p-4 md:p-6 border-2 border-orange-100 relative">
          <button 
            onClick={() => setIsCreatingCustom(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-bold text-gray-900 mb-4">创建自定义计划</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">计划名称</label>
              <input
                type="text"
                value={customPlanName}
                onChange={(e) => setCustomPlanName(e.target.value)}
                placeholder="例如：我的胸背腿计划"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每周训练天数</label>
              <select
                value={customPlanDays}
                onChange={(e) => setCustomPlanDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
              >
                {[1, 2, 3, 4, 5, 6, 7].map(num => (
                  <option key={num} value={num}>{num} 天</option>
                ))}
              </select>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleCreateCustomPlan}
                disabled={savingCustom}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4 mr-2" />
                {savingCustom ? '创建中...' : '开始编辑'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 计划列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Dumbbell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">还没有训练计划</p>
          <p className="text-sm text-gray-400 mb-4">
            点击下方按钮，与 AI 教练对话创建个性化训练计划
          </p>
          <button
            onClick={startConsultation}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            开始咨询
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    plan.is_active ? 'bg-orange-100' : 'bg-gray-100'
                  }`}>
                    <Dumbbell className={`h-5 w-5 ${plan.is_active ? 'text-orange-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{plan.plan_name}</h3>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-500">
                      <span>{getDifficultyLabel(plan.difficulty_level)}</span>
                      {plan.goal && (
                        <>
                          <span>·</span>
                          <span>{getGoalLabel(plan.goal)}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>每周 {plan.days_per_week} 天</span>
                      {plan.periodization_type && (
                        <>
                          <span>·</span>
                          <span className="text-blue-600">{getPeriodizationLabel(plan.periodization_type)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {plan.is_active && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      使用中
                    </span>
                  )}
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}