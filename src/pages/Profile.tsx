import { useState, useEffect } from 'react';
import { useAuthStore, User } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { User as UserIcon, Mail, Calendar, Activity, Target, Save, Loader2, Ruler, Weight } from 'lucide-react';

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({});

  useEffect(() => {
    if (user) {
      setFormData(user);
    }
  }, [user]);

  // 从数据库重新加载用户数据
  const loadUserProfile = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (data) {
      setUser(data);
      setFormData(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUserProfile();
  }, []);

  const handleSave = async () => {
    if (!user?.id) return;
    
    setSaving(true);
    const { data, error } = await supabase
      .from('users')
      .update({
        name: formData.name,
        height: formData.height || null,
        weight: formData.weight || null,
        birth_date: formData.birth_date || null,
        gender: formData.gender || null,
        activity_level: formData.activity_level || null,
        fitness_goal: formData.fitness_goal || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single();

    if (data) {
      setUser(data);
      setFormData(data);
      alert('保存成功！');
    } else if (error) {
      console.error('Save error:', error);
      alert('保存失败：' + error.message);
    }
    setSaving(false);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toISOString().split('T')[0];
  };

  const getActivityLabel = (level?: string | null) => {
    const labels: Record<string, string> = {
      sedentary: '久坐不动',
      light: '轻度活动',
      moderate: '中度活动',
      active: '活跃',
      very_active: '非常活跃',
    };
    return level ? labels[level] || level : '';
  };

  const getGoalLabel = (goal?: string | null) => {
    const labels: Record<string, string> = {
      lose_weight: '减脂',
      gain_muscle: '增肌',
      maintain: '保持',
    };
    return goal ? labels[goal] || goal : '';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">个人资料</h1>

      {/* 基本信息 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-orange-500" />
          基本信息
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 用户名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>

          {/* 邮箱（只读） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="h-4 w-4 inline mr-1" />
              邮箱
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 sm:text-sm p-2 border"
            />
          </div>

          {/* 出生日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="h-4 w-4 inline mr-1" />
              出生日期
            </label>
            <input
              type="date"
              value={formData.birth_date ? formatDate(formData.birth_date) : ''}
              onChange={(e) => setFormData({ ...formData, birth_date: e.target.value || null })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>

          {/* 性别 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              性别
            </label>
            <select
              value={formData.gender || ''}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value as User['gender'] || null })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            >
              <option value="">未选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
        </div>
      </div>

      {/* 身体数据 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Ruler className="h-5 w-5 text-orange-500" />
          身体数据
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Ruler className="h-4 w-4 inline mr-1" />
              身高 (cm)
            </label>
            <input
              type="number"
              step="0.1"
              min="100"
              max="250"
              value={formData.height ?? ''}
              onChange={(e) => setFormData({ ...formData, height: e.target.value ? Number(e.target.value) : null })}
              placeholder="例如: 175"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Weight className="h-4 w-4 inline mr-1" />
              体重 (kg)
            </label>
            <input
              type="number"
              step="0.1"
              min="20"
              max="300"
              value={formData.weight ?? ''}
              onChange={(e) => setFormData({ ...formData, weight: e.target.value ? Number(e.target.value) : null })}
              placeholder="例如: 70"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        {formData.height && formData.weight ? (
          <div className="mt-4 p-3 bg-orange-50 rounded-md">
            <p className="text-sm text-gray-700">
              BMI: <span className="font-semibold text-orange-600">
                {(formData.weight / ((formData.height / 100) ** 2)).toFixed(1)}
              </span>
              <span className="ml-2 text-gray-500">
                ({(() => {
                  const bmi = formData.weight! / ((formData.height! / 100) ** 2);
                  if (bmi < 18.5) return '偏瘦';
                  if (bmi < 24) return '正常';
                  if (bmi < 28) return '偏胖';
                  return '肥胖';
                })()})
              </span>
            </p>
          </div>
        ) : null}
      </div>

      {/* 健身信息 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-orange-500" />
          健身信息
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 活动水平 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              活动水平
            </label>
            <select
              value={formData.activity_level || ''}
              onChange={(e) => setFormData({ ...formData, activity_level: e.target.value as User['activity_level'] || null })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            >
              <option value="">未选择</option>
              <option value="sedentary">久坐不动（很少或没有运动）</option>
              <option value="light">轻度活动（每周运动1-3天）</option>
              <option value="moderate">中度活动（每周运动3-5天）</option>
              <option value="active">活跃（每周运动6-7天）</option>
              <option value="very_active">非常活跃（体力劳动或高强度训练）</option>
            </select>
          </div>

          {/* 健身目标 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Target className="h-4 w-4 inline mr-1" />
              健身目标
            </label>
            <select
              value={formData.fitness_goal || ''}
              onChange={(e) => setFormData({ ...formData, fitness_goal: e.target.value as User['fitness_goal'] || null })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            >
              <option value="">未选择</option>
              <option value="lose_weight">减脂</option>
              <option value="gain_muscle">增肌</option>
              <option value="maintain">保持</option>
            </select>
          </div>
        </div>
      </div>

      {/* 账户信息 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">账户信息</h2>
        <div className="text-sm text-gray-500 space-y-1">
          <p>用户 ID: <span className="font-mono text-gray-700">{user?.id}</span></p>
          <p>注册时间: <span className="text-gray-700">{user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}</span></p>
          <p>最后更新: <span className="text-gray-700">{user?.updated_at ? new Date(user.updated_at).toLocaleDateString('zh-CN') : '-'}</span></p>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              保存修改
            </>
          )}
        </button>
      </div>
    </div>
  );
}