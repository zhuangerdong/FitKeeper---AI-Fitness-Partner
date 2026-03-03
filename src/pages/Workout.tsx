import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dumbbell, Plus, ChevronRight, Play, Pause, Trash2, X, Activity, Clock, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';

const workoutSchema = z.object({
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  goal: z.string().min(1, '请输入目标'),
  equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
  daysPerWeek: z.number().min(1).max(7),
});

type WorkoutFormValues = z.infer<typeof workoutSchema>;

interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

interface DaySchedule {
  day: string;
  focus: string;
  exercises: Exercise[];
}

interface WorkoutPlan {
  id: string;
  plan_name: string;
  difficulty_level: string;
  days_per_week: number;
  exercises_schedule: DaySchedule[];
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

    const prompt = `请帮我创建一个训练计划，要求如下：
- 训练经验：${data.experience === 'beginner' ? '初级(0-1年)' : data.experience === 'intermediate' ? '中级(1-3年)' : '高级(3年以上)'}
- 训练目标：${data.goal}
- 器材条件：${equipmentLabel[data.equipment]}
- 每周训练天数：${data.daysPerWeek}天

请直接调用 create_workout_plan 工具生成计划。每天安排4-6个动作。`;

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
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selectedPlan.plan_name}</h1>
              <div className="flex gap-4 mt-2 text-sm text-gray-500">
                <span>{getDifficultyLabel(selectedPlan.difficulty_level)}</span>
                <span>每周 {selectedPlan.days_per_week} 天</span>
                <span>创建于 {format(new Date(selectedPlan.created_at), 'yyyy-MM-dd')}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => togglePlanActive(selectedPlan.id, !selectedPlan.is_active)}
                className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium ${
                  selectedPlan.is_active
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {selectedPlan.is_active ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    停止使用
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    开始使用
                  </>
                )}
              </button>
              <button
                onClick={() => deletePlan(selectedPlan.id)}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除
              </button>
            </div>
          </div>
        </div>

        {/* 每日训练 */}
        <div className="grid gap-6 md:grid-cols-2">
          {selectedPlan.exercises_schedule.map((day, index) => (
            <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex justify-between items-center">
                <h3 className="font-medium text-orange-800">{day.day}</h3>
                <span className="text-xs font-medium bg-orange-200 text-orange-800 px-2 py-1 rounded-full">
                  {day.focus}
                </span>
              </div>
              <div className="p-4">
                <ul className="space-y-3">
                  {day.exercises.map((exercise, idx) => (
                    <li key={idx} className="flex items-start p-2 rounded hover:bg-gray-50">
                      <Dumbbell className="h-5 w-5 text-gray-400 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{exercise.name}</p>
                        <div className="flex items-center mt-1 gap-4 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Activity className="h-3 w-3 mr-1" />
                            {exercise.sets} 组
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {exercise.reps} 次
                          </span>
                        </div>
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
        <h1 className="text-2xl font-bold text-gray-900">训练计划</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          新建计划
        </button>
      </div>

      {/* 创建表单弹窗 */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-medium">创建训练计划</h2>
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
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">训练目标</label>
                <input
                  type="text"
                  placeholder="如：增肌、减脂、力量"
                  {...register('goal')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
                />
                {errors.goal && <span className="text-red-500 text-xs">{errors.goal.message}</span>}
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
                    <div className="flex gap-3 text-sm text-gray-500">
                      <span>{getDifficultyLabel(plan.difficulty_level)}</span>
                      <span>每周 {plan.days_per_week} 天</span>
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