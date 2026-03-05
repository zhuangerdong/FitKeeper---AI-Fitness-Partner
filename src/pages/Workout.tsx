import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dumbbell, Plus, ChevronRight, Play, Pause, Trash2, X, Activity, Clock, Calendar, Target, TrendingUp, RotateCcw, Flame } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

const workoutSchema = z.object({
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  goal: z.enum(['hypertrophy', 'strength', 'fat_loss', 'general']),
  equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
  daysPerWeek: z.number().min(1).max(7),
});

type WorkoutFormValues = z.infer<typeof workoutSchema>;

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
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlan | null>(null);
  const [generating, setGenerating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkoutFormValues>({
    resolver: zodResolver(workoutSchema),
    defaultValues: {
      experience: 'beginner',
      goal: 'hypertrophy',
      equipment: 'gym',
      daysPerWeek: 3,
    },
  });

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

  const onSubmit = async (data: WorkoutFormValues) => {
    if (!user?.id) return;
    setGenerating(true);

    const equipmentLabel: Record<string, string> = {
      gym: '健身房（杠铃、哑铃、器械都可以用）',
      dumbbells: '只有哑铃',
      bodyweight: '没有器材，只能徒手训练',
    };

    const goalLabel: Record<string, string> = {
      hypertrophy: '增肌',
      strength: '力量',
      fat_loss: '减脂塑形',
      general: '一般健身',
    };

    const prompt = `请帮我创建一个科学、个性化的训练计划，要求如下：
- 训练经验：${data.experience === 'beginner' ? '初级(0-1年)' : data.experience === 'intermediate' ? '中级(1-3年)' : '高级(3年以上)'}
- 训练目标：${goalLabel[data.goal]}
- 器材条件：${equipmentLabel[data.equipment]}
- 每周训练天数：${data.daysPerWeek}天

请按照科学训练原则设计：
1. 根据我的经验水平确定每周训练容量（组数/肌群）
2. 选择合适的周期化方式
3. 安排减载周
4. 提供渐进超负荷的具体方法

请调用 create_workout_plan 工具生成完整计划。`;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          user_id: user.id,
        }),
      });

      if (!response.ok) throw new Error('AI 生成失败');

      await loadPlans();
      setShowCreateForm(false);
      reset();

      // 自动选中最新创建的计划
      const { data: latestPlan } = await supabase
        .from('workout_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestPlan) setSelectedPlan(latestPlan);
    } catch (err: any) {
      console.error('Error creating plan:', err);
      alert('创建失败：' + err.message);
    }

    setGenerating(false);
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

  const getDeloadMethodLabel = (method?: string) => {
    const labels: Record<string, string> = {
      volume_deload: '减少组数',
      intensity_deload: '降低重量',
      full_deload: '全面减载',
    };
    return method ? labels[method] || method : null;
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
          {selectedPlan.exercises_schedule.map((day, index) => (
            <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
              <div className={`px-4 py-3 border-b flex justify-between items-center ${
                day.day_type === 'strength' ? 'bg-red-50 border-red-100' :
                day.day_type === 'hypertrophy' ? 'bg-blue-50 border-blue-100' :
                day.day_type === 'power' ? 'bg-purple-50 border-purple-100' :
                'bg-orange-50 border-orange-100'
              }`}>
                <h3 className={`font-medium ${
                  day.day_type === 'strength' ? 'text-red-800' :
                  day.day_type === 'hypertrophy' ? 'text-blue-800' :
                  day.day_type === 'power' ? 'text-purple-800' :
                  'text-orange-800'
                }`}>{day.day}</h3>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  day.day_type === 'strength' ? 'bg-red-200 text-red-800' :
                  day.day_type === 'hypertrophy' ? 'bg-blue-200 text-blue-800' :
                  day.day_type === 'power' ? 'bg-purple-200 text-purple-800' :
                  'bg-orange-200 text-orange-800'
                }`}>
                  {day.focus}
                </span>
              </div>
              <div className="p-4">
                <ul className="space-y-3">
                  {day.exercises.map((exercise, idx) => (
                    <li key={idx} className="flex items-start p-2 rounded hover:bg-gray-50">
                      <div className={`h-5 w-5 rounded flex items-center justify-center mr-3 flex-shrink-0 mt-0.5 ${
                        exercise.type === 'compound' ? 'bg-blue-100 text-blue-600' :
                        exercise.type === 'accessory' ? 'bg-green-100 text-green-600' :
                        exercise.type === 'isolation' ? 'bg-gray-100 text-gray-600' :
                        'bg-orange-100 text-orange-600'
                      }`}>
                        <Dumbbell className="h-3 w-3" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{exercise.name}</p>
                        <div className="flex flex-wrap items-center mt-1 gap-3 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Activity className="h-3 w-3 mr-1" />
                            {exercise.sets} 组
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {exercise.reps} 次
                          </span>
                          {exercise.rest_seconds && (
                            <span className="text-gray-400">休息 {exercise.rest_seconds}s</span>
                          )}
                        </div>
                        {exercise.notes && (
                          <p className="text-xs text-gray-400 mt-1">{exercise.notes}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
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
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-3 md:px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">新建</span>计划
        </button>
      </div>

      {/* 创建表单弹窗 */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-medium">创建科学训练计划</h2>
              <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">训练经验</label>
                <select
                  {...register('experience')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
                >
                  <option value="beginner">初级 (0-1 年)</option>
                  <option value="intermediate">中级 (1-3 年)</option>
                  <option value="advanced">高级 (3+ 年)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">影响训练容量和渐进方式</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">训练目标</label>
                <select
                  {...register('goal')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
                >
                  <option value="hypertrophy">增肌</option>
                  <option value="strength">力量</option>
                  <option value="fat_loss">减脂塑形</option>
                  <option value="general">一般健身</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">决定次数范围和周期化方式</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">器材条件</label>
                <select
                  {...register('equipment')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
                >
                  <option value="gym">健身房</option>
                  <option value="dumbbells">仅哑铃</option>
                  <option value="bodyweight">徒手训练</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">每周训练天数</label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  {...register('daysPerWeek', { valueAsNumber: true })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
                />
                <p className="text-xs text-gray-400 mt-1">
                  推荐：新手2-3天，中级3-4天，高级4-6天
                </p>
              </div>

              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                <p className="font-medium mb-1">🔬 科学训练原则</p>
                <ul className="text-xs space-y-1 text-blue-600">
                  <li>• 基于研究支持的训练容量和频率</li>
                  <li>• 自动安排周期化和减载周</li>
                  <li>• 提供渐进超负荷的具体方法</li>
                </ul>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
                >
                  {generating ? 'AI 生成中...' : 'AI 生成计划'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 计划列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Dumbbell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">还没有训练计划</p>
          <p className="text-sm text-gray-400 mb-4">让 AI 根据科学原则为你创建个性化训练计划</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            创建你的第一个计划
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