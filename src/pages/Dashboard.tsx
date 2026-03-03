import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Loader2, TrendingDown, Dumbbell, Utensils } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// 体重记录类型
interface BodyData {
  id: string;
  weight: number;
  height: number | null;
  body_fat: number | null;
  record_date: string;
  created_at: string;
}

// 营养计划类型
interface NutritionPlan {
  id: string;
  daily_calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
  is_active: boolean;
  start_date: string;
}

// 训练计划类型
interface WorkoutPlan {
  id: string;
  plan_name: string;
  difficulty_level: string;
  days_per_week: number;
  is_active: boolean;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [bodyData, setBodyData] = useState<BodyData[]>([]);
  const [nutritionPlan, setNutritionPlan] = useState<NutritionPlan | null>(null);
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadDashboardData();
    }
  }, [user?.id]);

  const loadDashboardData = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // 并行获取所有数据
      const [bodyRes, nutritionRes, workoutRes] = await Promise.all([
        // 获取最近 7 条体重记录
        supabase
          .from('body_data')
          .select('*')
          .eq('user_id', user.id)
          .order('record_date', { ascending: false })
          .limit(7),
        // 获取当前活跃的营养计划
        supabase
          .from('nutrition_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single(),
        // 获取训练计划
        supabase
          .from('workout_plans')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (bodyRes.data) {
        setBodyData(bodyRes.data.reverse()); // 反转使日期升序
      }
      if (nutritionRes.data) {
        setNutritionPlan(nutritionRes.data);
      }
      if (workoutRes.data) {
        setWorkoutPlans(workoutRes.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 计算体重变化
  const getWeightChange = () => {
    if (bodyData.length < 2) return null;
    const latest = bodyData[bodyData.length - 1].weight;
    const previous = bodyData[bodyData.length - 2].weight;
    const change = latest - previous;
    return change;
  };

  // 体重图表数据
  const weightChartData = {
    labels: bodyData.map(d => formatDate(d.record_date)),
    datasets: [
      {
        label: '体重 (kg)',
        data: bodyData.map(d => d.weight),
        borderColor: 'rgb(255, 107, 53)',
        backgroundColor: 'rgba(255, 107, 53, 0.5)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  // 营养图表数据
  const nutritionChartData = nutritionPlan ? {
    labels: ['蛋白质', '碳水', '脂肪'],
    datasets: [
      {
        data: [nutritionPlan.protein_grams, nutritionPlan.carbs_grams, nutritionPlan.fat_grams],
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
        ],
        borderWidth: 1,
      },
    ],
  } : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 当前体重 */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">当前体重</p>
              <p className="text-2xl font-bold text-gray-900">
                {bodyData.length > 0 ? `${bodyData[bodyData.length - 1].weight} kg` : '-- kg'}
              </p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
              <TrendingDown className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          {getWeightChange() !== null && (
            <p className={`text-sm mt-2 ${getWeightChange()! < 0 ? 'text-green-600' : 'text-red-600'}`}>
              {getWeightChange()! < 0 ? '↓' : '↑'} {Math.abs(getWeightChange()!).toFixed(1)} kg vs 上次
            </p>
          )}
        </div>

        {/* 活跃训练计划 */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">训练计划</p>
              <p className="text-2xl font-bold text-gray-900">
                {workoutPlans.filter(p => p.is_active).length > 0 
                  ? workoutPlans.find(p => p.is_active)?.plan_name 
                  : '暂无'}
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          {workoutPlans.filter(p => p.is_active).length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              每周 {workoutPlans.find(p => p.is_active)?.days_per_week} 天
            </p>
          )}
        </div>

        {/* 营养目标 */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">每日热量目标</p>
              <p className="text-2xl font-bold text-gray-900">
                {nutritionPlan ? `${nutritionPlan.daily_calories} kcal` : '-- kcal'}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
              <Utensils className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* 体重图表 */}
        <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">体重变化</h2>
          {bodyData.length > 0 ? (
            <Line 
              data={weightChartData} 
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  y: { beginAtZero: false },
                },
              }}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <TrendingDown className="h-12 w-12 mx-auto mb-2" />
                <p>暂无体重记录</p>
                <p className="text-sm">去营养页面记录你的体重吧</p>
              </div>
            </div>
          )}
        </div>

        {/* 营养分布 */}
        <div className="col-span-1 bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">营养目标</h2>
          {nutritionChartData ? (
            <>
              <div className="h-48 flex justify-center">
                <Doughnut 
                  data={nutritionChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                  }}
                />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">蛋白质</span>
                  <span className="font-medium">{nutritionPlan?.protein_grams}g</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">碳水</span>
                  <span className="font-medium">{nutritionPlan?.carbs_grams}g</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">脂肪</span>
                  <span className="font-medium">{nutritionPlan?.fat_grams}g</span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Utensils className="h-12 w-12 mx-auto mb-2" />
                <p>暂无营养计划</p>
              </div>
            </div>
          )}
        </div>

        {/* 训练计划 */}
        <div className="col-span-1 md:col-span-3 bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">训练计划</h2>
          {workoutPlans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">计划名称</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">难度</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">每周天数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {workoutPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{plan.plan_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {plan.difficulty_level === 'beginner' ? '初级' :
                         plan.difficulty_level === 'intermediate' ? '中级' : '高级'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{plan.days_per_week} 天</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          plan.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {plan.is_active ? '进行中' : '已暂停'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Dumbbell className="h-12 w-12 mx-auto mb-2" />
                <p>暂无训练计划</p>
                <p className="text-sm">去训练页面创建你的计划吧</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}