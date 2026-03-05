import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fitnessKB = JSON.parse(
  readFileSync(join(__dirname, '../../data/fitness_knowledge_base.json'), 'utf-8')
);

// 加载科学训练知识库
let scientificKB: any = null;
try {
  scientificKB = JSON.parse(
    readFileSync(join(__dirname, '../../data/scientific_training_knowledge.json'), 'utf-8')
  );
} catch (e) {
  console.warn('Could not load scientific training knowledge base');
}

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!
);

// ============ 工具定义 ============
const tools: Anthropic.Tool[] = [
  {
    name: 'get_user_profile',
    description: '获取用户的个人资料，包括身高、体重、健身目标等',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'get_body_data',
    description: '获取用户的体重记录历史',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        days: { type: 'number', description: '获取最近几天的数据，默认7天' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'get_workout_plans',
    description: '获取用户的训练计划',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        active_only: { type: 'boolean', description: '只获取正在使用的计划' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'get_nutrition_plan',
    description: '获取用户的营养计划',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'log_weight',
    description: '记录用户今天的体重',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        weight: { type: 'number', description: '体重(kg)' }
      },
      required: ['user_id', 'weight']
    }
  },
  {
    name: 'update_nutrition_plan',
    description: '更新用户的营养计划',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        daily_calories: { type: 'number', description: '每日热量目标' },
        protein_grams: { type: 'number', description: '蛋白质(克)' },
        carbs_grams: { type: 'number', description: '碳水化合物(克)' },
        fat_grams: { type: 'number', description: '脂肪(克)' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'create_workout_plan',
    description: '创建一个科学、个性化的训练计划并保存到数据库。必须基于用户资料、训练原则和动作数据库来设计。计划应包含周期化结构、渐进超负荷策略和恢复安排。',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        plan_name: { type: 'string', description: '计划名称，如"增肌训练计划"、"力量周期计划"' },
        goal: { type: 'string', enum: ['hypertrophy', 'strength', 'powerbuilding', 'fat_loss', 'general'], description: '训练目标' },
        difficulty_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: '难度等级' },
        days_per_week: { type: 'number', description: '每周训练天数(1-7)' },
        periodization_type: { type: 'string', enum: ['linear', 'daily_undulating', 'weekly_undulating', 'block'], description: '周期化类型' },
        mesocycle_length_weeks: { type: 'number', description: '中周期长度(周)，通常4-8周' },
        exercises_schedule: {
          type: 'array',
          description: '每天的训练安排',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', description: '如"第 1 天"或"推日"' },
              day_type: { type: 'string', enum: ['strength', 'hypertrophy', 'power', 'recovery'], description: '该日训练类型（用于周期化）' },
              focus: { type: 'string', description: '训练重点，如"胸+三头"、"背+二头"、"腿"、"上肢力量"' },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '动作名称' },
                    type: { type: 'string', enum: ['compound', 'accessory', 'isolation'], description: '动作类型' },
                    primary_muscle: { type: 'string', description: '主要目标肌群' },
                    sets: { type: 'number', description: '组数' },
                    reps: { type: 'string', description: '每组次数范围，如"6-8"、"8-12"' },
                    intensity: { type: 'string', description: '强度，如"70-75% 1RM"或"RPE 7-8"' },
                    rest_seconds: { type: 'number', description: '组间休息时间(秒)' },
                    progression_method: { type: 'string', enum: ['double_progression', 'linear', 'rpe'], description: '渐进方法' },
                    notes: { type: 'string', description: '注意事项，如"控制离心2秒"' },
                    alternative_exercises: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: '替代动作列表' 
                    }
                  },
                  required: ['name', 'sets', 'reps']
                }
              }
            },
            required: ['day', 'focus', 'exercises']
          }
        },
        weekly_volume_summary: {
          type: 'object',
          description: '每周各肌群训练量总结',
          properties: {
            chest_sets: { type: 'number' },
            back_sets: { type: 'number' },
            shoulders_sets: { type: 'number' },
            biceps_sets: { type: 'number' },
            triceps_sets: { type: 'number' },
            quads_sets: { type: 'number' },
            hamstrings_sets: { type: 'number' },
            glutes_sets: { type: 'number' }
          }
        },
        deload_schedule: {
          type: 'object',
          description: '减载周安排',
          properties: {
            deload_week: { type: 'number', description: '减载周次（如第5周）' },
            method: { type: 'string', enum: ['volume_deload', 'intensity_deload', 'full_deload'], description: '减载方式' }
          }
        },
        progression_plan: {
          type: 'string',
          description: '渐进超负荷计划描述，如"每周尝试增加2.5kg或增加1-2次"'
        },
        warmup_guidance: {
          type: 'string',
          description: '热身指导'
        },
        recovery_notes: {
          type: 'string',
          description: '恢复建议'
        }
      },
      required: ['user_id', 'plan_name', 'goal', 'difficulty_level', 'days_per_week', 'exercises_schedule']
    }
  },
  {
    name: 'update_user_profile',
    description: '更新用户的个人资料信息。当用户提到身高、体重、性别、出生日期、活动水平、健身目标时，主动调用此工具保存。',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        height: { type: 'number', description: '身高(cm)' },
        weight: { type: 'number', description: '体重(kg)' },
        gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
        birth_date: { type: 'string', description: '出生日期，格式 YYYY-MM-DD' },
        activity_level: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'], description: '活动水平' },
        fitness_goal: { type: 'string', enum: ['lose_weight', 'gain_muscle', 'maintain'], description: '健身目标' },
        name: { type: 'string', description: '用户名' }
      },
      required: ['user_id']
    }
  },
  {
    name: 'calculate_nutrition_plan',
    description: '根据用户的身体数据计算个性化的营养计划（热量和三大营养素）。使用 Mifflin-St Jeor 公式计算基础代谢率，然后根据活动水平和目标调整。计算结果会自动保存到数据库。',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        weight: { type: 'number', description: '体重(kg)' },
        height: { type: 'number', description: '身高(cm)' },
        age: { type: 'number', description: '年龄' },
        gender: { type: 'string', enum: ['male', 'female'], description: '性别' },
        activity_level: { type: 'string', enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'], description: '活动水平' },
        goal: { type: 'string', enum: ['lose_weight', 'gain_muscle', 'maintain'], description: '健身目标' }
      },
      required: ['user_id', 'weight', 'height', 'age', 'gender', 'activity_level', 'goal']
    }
  },
  {
    name: 'get_training_guidelines',
    description: '获取基础训练原则和指南（分化方案、训练量标准、组次范围、渐进超负荷、恢复建议等）。在设计训练计划或回答训练相关问题时调用。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_scientific_training_knowledge',
    description: '获取科学训练知识库，包含周期化训练、SRA曲线、容量指南、次数范围研究、渐进超负荷方法等科学依据。设计训练计划时必须调用此工具获取最新研究支持的训练参数。',
    input_schema: {
      type: 'object',
      properties: {
        topic: { 
          type: 'string', 
          enum: ['periodization', 'volume_guidelines', 'rep_ranges', 'sra_curve', 'progressive_overload', 'deload', 'session_structure', 'split_recommendations', 'goal_specific_programming', 'all'],
          description: '要获取的知识主题，默认获取全部'
        }
      },
      required: []
    }
  },
  {
    name: 'query_exercise_db',
    description: '从动作数据库中按肌群和器材查询推荐动作。可一次查询多个肌群。',
    input_schema: {
      type: 'object',
      properties: {
        muscles: {
          type: 'array',
          items: { type: 'string', enum: ['chest', 'lats', 'middle back', 'lower back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'abdominals', 'abductors', 'adductors', 'neck'] },
          description: '要查询的肌群列表'
        },
        equipment: {
          type: 'string',
          enum: ['gym', 'dumbbell', 'bodyweight'],
          description: '器材类型'
        }
      },
      required: ['muscles']
    }
  }
];

// ============ 工具执行函数 ============
async function executeTool(name: string, args: Record<string, any>): Promise<any> {
  const { user_id, ...params } = args;

  switch (name) {
    case 'get_user_profile': {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user_id)
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case 'get_body_data': {
      const days = params.days || 7;
      const { data, error } = await supabase
        .from('body_data')
        .select('*')
        .eq('user_id', user_id)
        .order('record_date', { ascending: false })
        .limit(days);
      if (error) return { error: error.message };
      return data;
    }

    case 'get_workout_plans': {
      let query = supabase
        .from('workout_plans')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });
      
      if (params.active_only) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query;
      if (error) return { error: error.message };
      return data;
    }

    case 'get_nutrition_plan': {
      const { data, error } = await supabase
        .from('nutrition_plans')
        .select('*')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single();
      if (error && error.code !== 'PGRST116') return { error: error.message };
      return data || null;
    }

    case 'log_weight': {
      const today = new Date().toISOString().split('T')[0];
      
      // 同步体重到用户资料
      await supabase
        .from('users')
        .update({ weight: params.weight, updated_at: new Date().toISOString() })
        .eq('id', user_id);

      // 检查今天是否已有记录
      const { data: existing } = await supabase
        .from('body_data')
        .select('*')
        .eq('user_id', user_id)
        .eq('record_date', today)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('body_data')
          .update({ weight: params.weight })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, message: `已更新今天的体重记录: ${params.weight}kg`, data };
      } else {
        const { data, error } = await supabase
          .from('body_data')
          .insert({
            user_id,
            weight: params.weight,
            record_date: today
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, message: `已记录今天的体重: ${params.weight}kg`, data };
      }
    }

    case 'update_nutrition_plan': {
      // 先检查是否有活跃计划
      const { data: existing } = await supabase
        .from('nutrition_plans')
        .select('*')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .single();

      if (existing) {
        // 更新现有计划
        const updateData: Record<string, any> = {};
        if (params.daily_calories) updateData.daily_calories = params.daily_calories;
        if (params.protein_grams) updateData.protein_grams = params.protein_grams;
        if (params.carbs_grams) updateData.carbs_grams = params.carbs_grams;
        if (params.fat_grams) updateData.fat_grams = params.fat_grams;

        const { data, error } = await supabase
          .from('nutrition_plans')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, message: '营养计划已更新', data };
      } else {
        // 创建新计划
        const { data, error } = await supabase
          .from('nutrition_plans')
          .insert({
            user_id,
            daily_calories: params.daily_calories || 2000,
            protein_grams: params.protein_grams || 150,
            carbs_grams: params.carbs_grams || 200,
            fat_grams: params.fat_grams || 65,
            start_date: new Date().toISOString(),
            is_active: true
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, message: '已创建新的营养计划', data };
      }
    }

    case 'create_workout_plan': {
      // 先停用该用户的其他计划
      await supabase
        .from('workout_plans')
        .update({ is_active: false })
        .eq('user_id', user_id);

      // 构建插入数据
      const insertData: Record<string, any> = {
        user_id,
        plan_name: params.plan_name,
        difficulty_level: params.difficulty_level,
        days_per_week: params.days_per_week,
        exercises_schedule: params.exercises_schedule,
        start_date: new Date().toISOString(),
        is_active: true,
      };

      // 添加可选字段
      if (params.goal) insertData.goal = params.goal;
      if (params.periodization_type) insertData.periodization_type = params.periodization_type;
      if (params.mesocycle_length_weeks) insertData.mesocycle_length_weeks = params.mesocycle_length_weeks;
      if (params.weekly_volume_summary) insertData.weekly_volume_summary = params.weekly_volume_summary;
      if (params.deload_schedule) insertData.deload_schedule = params.deload_schedule;
      if (params.progression_plan) insertData.progression_plan = params.progression_plan;
      if (params.warmup_guidance) insertData.warmup_guidance = params.warmup_guidance;
      if (params.recovery_notes) insertData.recovery_notes = params.recovery_notes;

      const { data, error } = await supabase
        .from('workout_plans')
        .insert(insertData)
        .select()
        .single();

      if (error) return { error: error.message };

      // 构建容量总结信息
      let volumeInfo = '';
      if (params.weekly_volume_summary) {
        const vol = params.weekly_volume_summary;
        volumeInfo = `\n\n📊 **每周训练容量：**
- 胸部：${vol.chest_sets || 0} 组
- 背部：${vol.back_sets || 0} 组
- 肩部：${vol.shoulders_sets || 0} 组
- 二头：${vol.biceps_sets || 0} 组
- 三头：${vol.triceps_sets || 0} 组
- 股四头：${vol.quads_sets || 0} 组
- 腘绳肌：${vol.hamstrings_sets || 0} 组
- 臀部：${vol.glutes_sets || 0} 组`;
      }

      // 构建周期化信息
      let periodizationInfo = '';
      if (params.periodization_type) {
        const periodNames: Record<string, string> = {
          'linear': '线性周期化',
          'daily_undulating': '每日波动周期化',
          'weekly_undulating': '每周波动周期化',
          'block': '板块周期化'
        };
        periodizationInfo = `\n\n📅 **周期化类型：** ${periodNames[params.periodization_type] || params.periodization_type}`;
        if (params.mesocycle_length_weeks) {
          periodizationInfo += `（${params.mesocycle_length_weeks}周中周期）`;
        }
      }

      // 构建减载信息
      let deloadInfo = '';
      if (params.deload_schedule) {
        const methods: Record<string, string> = {
          'volume_deload': '减少组数',
          'intensity_deload': '降低重量',
          'full_deload': '全面减载'
        };
        deloadInfo = `\n\n🔄 **减载安排：** 第${params.deload_schedule.deload_week}周 - ${methods[params.deload_schedule.method] || params.deload_schedule.method}`;
      }

      return {
        success: true,
        message: `训练计划"${params.plan_name}"已创建并设为当前使用计划${volumeInfo}${periodizationInfo}${deloadInfo}`,
        plan_id: data.id,
        data
      };
    }

    case 'update_user_profile': {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      if (params.height != null) updateData.height = params.height;
      if (params.weight != null) updateData.weight = params.weight;
      if (params.gender) updateData.gender = params.gender;
      if (params.birth_date) updateData.birth_date = params.birth_date;
      if (params.activity_level) updateData.activity_level = params.activity_level;
      if (params.fitness_goal) updateData.fitness_goal = params.fitness_goal;
      if (params.name) updateData.name = params.name;

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user_id)
        .select()
        .single();

      if (error) return { error: error.message };

      // 如果更新了体重，也同步到 body_data 历史记录
      if (params.weight != null) {
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('body_data')
          .select('id')
          .eq('user_id', user_id)
          .eq('record_date', today)
          .single();

        if (existing) {
          await supabase.from('body_data').update({ weight: params.weight }).eq('id', existing.id);
        } else {
          await supabase.from('body_data').insert({
            user_id,
            weight: params.weight,
            height: params.height || data.height || 170,
            record_date: today
          });
        }
      }

      const updated: string[] = [];
      if (params.height != null) updated.push(`身高: ${params.height}cm`);
      if (params.weight != null) updated.push(`体重: ${params.weight}kg`);
      if (params.gender) updated.push(`性别: ${params.gender === 'male' ? '男' : '女'}`);
      if (params.birth_date) updated.push(`出生日期: ${params.birth_date}`);
      if (params.activity_level) updated.push(`活动水平: ${params.activity_level}`);
      if (params.fitness_goal) updated.push(`健身目标: ${params.fitness_goal}`);
      if (params.name) updated.push(`用户名: ${params.name}`);

      return { success: true, message: `已更新个人资料: ${updated.join(', ')}`, data };
    }

    case 'calculate_nutrition_plan': {
      const { weight, height, age, gender, activity_level, goal } = params;

      // ========== Mifflin-St Jeor 公式 ==========
      // BMR (基础代谢率) 计算
      let bmr = 10 * weight + 6.25 * height - 5 * age;
      if (gender === 'male') {
        bmr += 5;
      } else {
        bmr -= 161;
      }

      // 活动系数
      const activityMultipliers: Record<string, number> = {
        sedentary: 1.2,      // 久坐不动
        light: 1.375,        // 轻度活动
        moderate: 1.55,      // 中度活动
        active: 1.725,       // 活跃
        very_active: 1.9,    // 非常活跃
      };

      // TDEE (每日总能量消耗)
      let tdee = bmr * activityMultipliers[activity_level];

      // 根据目标调整热量
      let calorieAdjustment = '';
      if (goal === 'lose_weight') {
        tdee -= 400; // 温和减脂，每周约0.4kg
        calorieAdjustment = '减脂期：热量 deficit 400 kcal';
      } else if (goal === 'gain_muscle') {
        tdee += 250; // 温和增肌，减少脂肪堆积
        calorieAdjustment = '增肌期：热量 surplus 250 kcal';
      } else {
        calorieAdjustment = '维持期：保持当前热量';
      }

      // ========== 三大营养素计算 ==========
      // 蛋白质：根据运动科学研究的合理范围
      // 参考文献：Jäger et al. (2017) ISSN position stand
      let proteinPerKg = 1.6; // 默认 1.6g/kg（研究支持的最低有效值）
      if (goal === 'lose_weight') {
        proteinPerKg = 1.8; // 减脂期：1.8g/kg 保护肌肉（而非2.4）
      } else if (goal === 'gain_muscle') {
        proteinPerKg = 1.8; // 增肌期：1.8g/kg 已足够
      }
      const protein = Math.round(weight * proteinPerKg);
      const proteinCalories = protein * 4;

      // 脂肪：占总热量的 25-30%（减脂期略低）
      const fatRatio = goal === 'lose_weight' ? 0.25 : 0.28;
      const fatCalories = tdee * fatRatio;
      const fat = Math.round(fatCalories / 9);

      // 碳水：剩余热量
      const carbCalories = tdee - proteinCalories - fatCalories;
      const carbs = Math.round(carbCalories / 4);

      const nutritionPlan = {
        calories: Math.round(tdee),
        protein,
        carbs,
        fat,
        bmr: Math.round(bmr),
        tdee: Math.round(tdee / activityMultipliers[activity_level] * activityMultipliers[activity_level])
      };

      // ========== 保存到数据库 ==========
      // 先停用现有计划
      await supabase
        .from('nutrition_plans')
        .update({ is_active: false })
        .eq('user_id', user_id);

      // 创建新计划
      const { data, error } = await supabase
        .from('nutrition_plans')
        .insert({
          user_id,
          daily_calories: nutritionPlan.calories,
          protein_grams: nutritionPlan.protein,
          carbs_grams: nutritionPlan.carbs,
          fat_grams: nutritionPlan.fat,
          start_date: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (error) return { error: error.message };

      return {
        success: true,
        message: '营养计划已计算并保存',
        calculation: {
          formula: 'Mifflin-St Jeor Equation',
          bmr: Math.round(bmr),
          activity_multiplier: activityMultipliers[activity_level],
          adjustment: calorieAdjustment,
          protein_per_kg: proteinPerKg,
        },
        plan: nutritionPlan,
        data,
      };
    }

    case 'get_training_guidelines': {
      return fitnessKB.training_principles;
    }

    case 'get_scientific_training_knowledge': {
      if (!scientificKB) {
        return { error: 'Scientific training knowledge base not available' };
      }
      const topic = params.topic || 'all';
      if (topic === 'all') {
        return scientificKB;
      }
      return scientificKB[topic] || { error: `Topic '${topic}' not found` };
    }

    case 'query_exercise_db': {
      const muscles: string[] = params.muscles || [];
      const equipment: string = params.equipment;
      const db = fitnessKB.curated_exercises_by_muscle_and_equipment;
      const results: Record<string, any> = {};

      for (const muscle of muscles) {
        if (!db[muscle]) continue;
        if (equipment && db[muscle][equipment]) {
          results[muscle] = db[muscle][equipment];
        } else {
          results[muscle] = db[muscle];
        }
      }
      return results;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ============ Agent 主逻辑 ============
router.post('/', async (req, res) => {
  try {
    const { messages, user_id } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // 构建系统提示词
    const systemPrompt = `你是 FitKeeper 的 AI 健身助手，一个基于科学研究的私人教练和营养师。

## 你的能力
你可以通过工具访问和修改用户的数据：
- 查看用户资料、体重记录、训练计划、营养计划
- 记录体重、更新营养计划
- **更新用户个人资料**（身高、体重、性别、出生日期、活动水平、健身目标）
- **创建训练计划**（基于科学研究的个性化训练计划）

## 沟通风格
- 友好、专业、鼓励性
- 回答简洁但有用
- 适当使用 emoji
- 如果涉及医疗建议，提醒用户咨询医生

## 重要：主动记录用户信息
当用户在对话中提到以下任何信息时，你必须**立即调用 update_user_profile 工具**将信息保存到数据库，不需要额外确认：
- 身高（例如"我身高175cm"、"175厘米"、"1米75"）
- 体重（例如"我体重70kg"、"70公斤"、"140斤" → 换算为kg）
- 性别（例如"我是男生"、"女性"）
- 年龄或出生日期（例如"我25岁" → 推算出生年份、"1998年出生"）
- 活动水平（例如"我每天都运动"、"我很少运动"）
- 健身目标（例如"我想减肥"、"我要增肌"）

当用户同时提到多个信息时，在一次 update_user_profile 调用中一起更新。
保存后告诉用户信息已记录。

## ========== 科学训练计划创建流程（重要！） ==========

创建训练计划时，必须严格遵循以下科学原则：

### 第一步：收集信息
1. 调用 get_user_profile 获取用户身体数据
2. 调用 get_scientific_training_knowledge 获取最新研究支持的训练参数

### 第二步：确定基础参数（基于研究）

**训练容量（每周每肌群组数）- meta-analysis研究支持：**
- 新手：10-12 组/肌群/周
- 中级：12-16 组/肌群/周  
- 高级：16-20 组/肌群/周
- 最大有效上限：20-25 组/肌群/周

**分化方案选择：**
- 2天/周：全身A + 全身B（新手最佳）
- 3天/周：全身A/B/C 或 推/拉/腿
- 4天/周：上肢/下肢 × 2（最均衡）
- 5天/周：推/拉/腿/上肢/下肢
- 6天/周：推/拉/腿 × 2（高级）

**次数范围（研究显示差异约10-15%）：**
- 增肌：6-12次（主），配合1-5次和15-20次
- 力量：1-5次（主），配合6-10次
- 每次训练：60-70%在最佳范围，15-20%低次数，15-20%高次数

**周期化选择：**
- 新手：线性周期化（每周增加重量）
- 有经验者：每日波动周期化（DUP）效果更好约28%
- 中周期长度：4-6周后减载一周

### 第三步：选择动作
1. 调用 query_exercise_db 查询目标肌群和器材的动作
2. 动作安排原则：
   - 先复合动作（深蹲、硬拉、卧推、划船、推举）
   - 后孤立动作
   - 每次训练4-6个动作（新手）/ 5-7个动作（中高级）

### 第四步：创建计划
调用 create_workout_plan 工具，包含：
- 周期化类型和长度
- 每日训练安排（包含强度、休息时间、渐进方法）
- 每周容量总结（确保达到研究支持的范围）
- 减载周安排（第4-6周）
- 渐进超负荷计划
- 热身和恢复指导

### 第五步：向用户解释
告诉用户：
- 计划的科学依据
- 如何渐进（每周增加重量或次数）
- 何时应该减载
- 如何追踪进步

## 常见问题的科学回答

**"增肌应该用多大重量？"**
- 6-12次范围效果略好，但1-30次都能增肌
- 关键是接近力竭（RPE 7-9）和渐进超负荷
- 建议混合使用不同次数范围

**"多久练一次同一肌群？"**
- 基于SRA曲线：新手48-96小时，高级24-36小时
- 实际：新手2-3次/周，中高级2次/周即可
- 高压力状态恢复时间可能翻倍

**"每组做多少次最好？"**
- 研究：不同次数增肌效果差异小（10-15%）
- 力量训练：低次数（1-5）更优
- 建议：复合动作用较低次数，孤立动作用较高次数

用户ID: ${user_id}
当前日期: ${new Date().toLocaleDateString('zh-CN')}`;

    // 转换消息格式
    const conversationMessages: Anthropic.MessageParam[] = messages
      .filter((msg: any) => msg.role !== 'system')
      .map((msg: any) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

    // 第一次调用 - 可能会触发工具
    let response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'MiniMax-M2.5',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages: conversationMessages,
    });

    // 多轮工具调用循环（最多5轮，防止无限循环）
    let rounds = 0;
    while (rounds < 5) {
      let toolResults: Anthropic.ToolResultBlockParam[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          hasToolUse = true;
          const toolName = block.name;
          const toolArgs = block.input as Record<string, any>;
          
          console.log(`Tool call [round ${rounds + 1}]: ${toolName}`, toolArgs);
          
          const result = await executeTool(toolName, toolArgs);
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      if (!hasToolUse) break;

      conversationMessages.push({
        role: 'assistant',
        content: response.content,
      });
      conversationMessages.push({
        role: 'user',
        content: toolResults,
      });

      response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'MiniMax-M2.5',
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages: conversationMessages,
      });

      rounds++;
    }

    // 提取回复文本
    let reply = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        reply += block.text;
      }
    }

    res.json({ reply });
  } catch (error: any) {
    console.error('Agent error:', error);
    res.status(500).json({ 
      error: 'Failed to process request', 
      details: error.message 
    });
  }
});

export default router;