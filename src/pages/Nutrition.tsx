import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Loader2, Calculator, Sparkles, AlertCircle } from 'lucide-react';

export default function Nutrition() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [nutritionPlan, setNutritionPlan] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [missingInfo, setMissingInfo] = useState<string[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    
    // 获取用户资料
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user!.id)
      .single();
    
    if (profile) {
      setUserProfile(profile);
      
      // 检查缺少的信息
      const missing: string[] = [];
      if (!profile.weight) missing.push('体重');
      if (!profile.height) missing.push('身高');
      if (!profile.birth_date) missing.push('出生日期');
      if (!profile.gender) missing.push('性别');
      if (!profile.activity_level) missing.push('活动水平');
      if (!profile.fitness_goal) missing.push('健身目标');
      setMissingInfo(missing);
    }

    // 获取营养计划
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select('*')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .single();
    
    if (plan) {
      setNutritionPlan(plan);
    }

    setLoading(false);
  };

  // 调用 AI 计算营养计划
  const calculateWithAI = async () => {
    if (missingInfo.length > 0) {
      alert(`请先完善以下信息：${missingInfo.join('、')}`);
      return;
    }

    setCalculating(true);
    try {
      // 计算年龄
      const birthDate = new Date(userProfile.birth_date);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();

      // 调用 Chat API，让 AI 使用 calculate_nutrition_plan 工具
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user!.id,
          messages: [
            {
              role: 'user',
              content: '请根据我的身体数据帮我计算个性化的营养计划，包括每日热量和三大营养素（蛋白质、碳水化合物、脂肪）的目标值。'
            }
          ]
        }),
      });

      const data = await response.json();
      
      if (data.reply) {
        // 重新加载营养计划
        await loadData();
      }
    } catch (error) {
      console.error('Error calculating nutrition plan:', error);
      alert('计算失败，请稍后再试');
    }
    setCalculating(false);
  };

  // 计算年龄
  const getAge = () => {
    if (!userProfile?.birth_date) return null;
    const birthDate = new Date(userProfile.birth_date);
    const today = new Date();
    return today.getFullYear() - birthDate.getFullYear();
  };

  // 活动水平中文
  const getActivityLabel = (level: string) => {
    const labels: Record<string, string> = {
      sedentary: '久坐不动',
      light: '轻度活动',
      moderate: '中度活动',
      active: '活跃',
      very_active: '非常活跃',
    };
    return labels[level] || level;
  };

  // 目标中文
  const getGoalLabel = (goal: string) => {
    const labels: Record<string, string> = {
      lose_weight: '减脂',
      gain_muscle: '增肌',
      maintain: '维持',
    };
    return labels[goal] || goal;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">AI 营养顾问</h1>

      {/* 用户信息卡片 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium text-gray-900 mb-4">你的身体数据</h2>
        
        {userProfile ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{userProfile.weight || '--'}</div>
              <div className="text-sm text-gray-500">体重</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{userProfile.height || '--'}</div>
              <div className="text-sm text-gray-500">身高</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{getAge() || '--'}</div>
              <div className="text-sm text-gray-500">年龄</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">
                {userProfile.gender === 'male' ? '男' : userProfile.gender === 'female' ? '女' : '--'}
              </div>
              <div className="text-sm text-gray-500">性别</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg col-span-2">
              <div className="text-lg font-bold text-gray-900">
                {userProfile.activity_level ? getActivityLabel(userProfile.activity_level) : '--'}
              </div>
              <div className="text-sm text-gray-500">活动水平</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg col-span-2">
              <div className="text-lg font-bold text-gray-900">
                {userProfile.fitness_goal ? getGoalLabel(userProfile.fitness_goal) : '--'}
              </div>
              <div className="text-sm text-gray-500">健身目标</div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">暂无身体数据</p>
        )}

        {/* 缺少信息提示 */}
        {missingInfo.length > 0 && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-800">
                请先在 <a href="/profile" className="underline font-medium">个人资料</a> 页面完善以下信息：
                <span className="font-medium">{missingInfo.join('、')}</span>
              </p>
            </div>
          </div>
        )}

        {/* AI 计算按钮 */}
        <div className="mt-6">
          <button
            onClick={calculateWithAI}
            disabled={calculating || missingInfo.length > 0}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {calculating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                AI 正在计算...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                让 AI 计算我的营养计划
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center mt-2">
            使用 Mifflin-St Jeor 公式，根据你的身体数据个性化计算
          </p>
        </div>
      </div>

      {/* 营养计划结果 */}
      {nutritionPlan && (
        <div className="bg-white p-6 rounded-lg shadow animate-fade-in">
          <h2 className="text-lg font-medium text-gray-900 mb-6">你的每日营养目标</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{nutritionPlan.daily_calories}</div>
              <div className="text-sm text-gray-600">热量</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{nutritionPlan.protein_grams}g</div>
              <div className="text-sm text-gray-600">蛋白质</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{nutritionPlan.carbs_grams}g</div>
              <div className="text-sm text-gray-600">碳水</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{nutritionPlan.fat_grams}g</div>
              <div className="text-sm text-gray-600">脂肪</div>
            </div>
          </div>

          {/* 营养建议 */}
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">💡 饮食建议</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">🥩 蛋白质来源</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 鸡胸肉 200g ≈ 62g 蛋白</li>
                  <li>• 牛肉 150g ≈ 39g 蛋白</li>
                  <li>• 三文鱼 150g ≈ 30g 蛋白</li>
                  <li>• 鸡蛋 1个 ≈ 6g 蛋白</li>
                </ul>
              </div>
              <div className="border p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">🍚 碳水来源</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 燕麦 50g ≈ 30g 碳水</li>
                  <li>• 糙米饭 150g ≈ 35g 碳水</li>
                  <li>• 红薯 200g ≈ 40g 碳水</li>
                  <li>• 香蕉 1根 ≈ 27g 碳水</li>
                </ul>
              </div>
              <div className="border p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">🥑 健康脂肪</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 牛油果 半个 ≈ 15g 脂肪</li>
                  <li>• 杏仁 30g ≈ 14g 脂肪</li>
                  <li>• 橄榄油 1勺 ≈ 14g 脂肪</li>
                  <li>• 核桃 30g ≈ 18g 脂肪</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-500">
            <p>💡 <strong>提示：</strong>此计划基于 Mifflin-St Jeor 公式计算，根据你的身体数据和活动水平个性化定制。如有特殊健康状况，请咨询专业营养师。</p>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!nutritionPlan && (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <Calculator className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">还没有营养计划</p>
          <p className="text-sm text-gray-400">点击上方按钮，让 AI 为你计算个性化的营养目标</p>
        </div>
      )}
    </div>
  );
}