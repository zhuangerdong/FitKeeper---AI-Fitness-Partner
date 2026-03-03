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
    description: '创建一个完整的训练计划并保存到数据库。AI应根据用户的身体数据、经验水平、目标和可用器材，设计个性化的训练计划。',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: '用户ID' },
        plan_name: { type: 'string', description: '计划名称，如"增肌训练计划"、"减脂HIIT计划"' },
        difficulty_level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: '难度等级' },
        days_per_week: { type: 'number', description: '每周训练天数(1-7)' },
        exercises_schedule: {
          type: 'array',
          description: '每天的训练安排',
          items: {
            type: 'object',
            properties: {
              day: { type: 'string', description: '如"第 1 天"' },
              focus: { type: 'string', description: '训练重点，如"胸+三头"、"背+二头"、"腿"' },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: '动作名称' },
                    sets: { type: 'number', description: '组数' },
                    reps: { type: 'string', description: '每组次数，如"8-12"、"15"、"30秒"' }
                  },
                  required: ['name', 'sets', 'reps']
                }
              }
            },
            required: ['day', 'focus', 'exercises']
          }
        }
      },
      required: ['user_id', 'plan_name', 'difficulty_level', 'days_per_week', 'exercises_schedule']
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
    description: '获取训练原则和指南（分化方案、训练量标准、组次范围、渐进超负荷、恢复建议等）。在设计训练计划或回答训练相关问题时调用。',
    input_schema: {
      type: 'object',
      properties: {},
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

      const { data, error } = await supabase
        .from('workout_plans')
        .insert({
          user_id,
          plan_name: params.plan_name,
          difficulty_level: params.difficulty_level,
          days_per_week: params.days_per_week,
          exercises_schedule: params.exercises_schedule,
          start_date: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (error) return { error: error.message };
      return {
        success: true,
        message: `训练计划"${params.plan_name}"已创建并设为当前使用计划`,
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
    const systemPrompt = `你是 FitKeeper 的 AI 健身助手，一个专业的私人教练和营养师。

## 你的能力
你可以通过工具访问和修改用户的数据：
- 查看用户资料、体重记录、训练计划、营养计划
- 记录体重、更新营养计划
- **更新用户个人资料**（身高、体重、性别、出生日期、活动水平、健身目标）
- **创建训练计划**（根据用户需求生成个性化的训练计划并保存到数据库）

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

## 创建训练计划的流程
1. 先用 get_user_profile 获取用户信息
2. 调用 get_training_guidelines 获取训练原则（分化方案、训练量、组次范围）
3. 调用 query_exercise_db 按需查询目标肌群和器材的动作
4. 每天安排 4-6 个动作，以复合动作(compound)开头，孤立动作(isolation)收尾
5. 确保每个目标肌群在一周内达到足够训练量
6. 调用 create_workout_plan 工具保存
7. 告诉用户计划已创建，可在训练页面查看

## 工作方式
1. 用户提问时，先用工具获取相关数据
2. 基于数据给出个性化建议
3. 如果用户提到个人身体信息，**立即调用 update_user_profile 保存**
4. 如果用户要求记录体重，使用 log_weight 工具
5. 如果用户要求训练计划，先用 get_training_guidelines + query_exercise_db 查知识库，再调用 create_workout_plan 保存

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