-- 增强训练计划表，支持科学训练功能
-- 添加新字段支持周期化、渐进超负荷等

-- 添加训练目标字段
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS goal VARCHAR(20) 
CHECK (goal IN ('hypertrophy', 'strength', 'powerbuilding', 'fat_loss', 'general'));

-- 添加周期化类型字段
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS periodization_type VARCHAR(30) 
CHECK (periodization_type IN ('linear', 'daily_undulating', 'weekly_undulating', 'block'));

-- 添加中周期长度（周数）
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS mesocycle_length_weeks INTEGER DEFAULT 4;

-- 添加每周容量总结（JSONB格式）
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS weekly_volume_summary JSONB;

-- 添加减载安排（JSONB格式）
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS deload_schedule JSONB;

-- 添加渐进超负荷计划描述
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS progression_plan TEXT;

-- 添加热身指导
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS warmup_guidance TEXT;

-- 添加恢复建议
ALTER TABLE workout_plans 
ADD COLUMN IF NOT EXISTS recovery_notes TEXT;

-- 添加备注
COMMENT ON COLUMN workout_plans.goal IS '训练目标：hypertrophy(增肌), strength(力量), powerbuilding(力量+形体), fat_loss(减脂), general(一般健身)';
COMMENT ON COLUMN workout_plans.periodization_type IS '周期化类型：linear(线性), daily_undulating(每日波动), weekly_undulating(每周波动), block(板块)';
COMMENT ON COLUMN workout_plans.mesocycle_length_weeks IS '中周期长度，通常4-8周';
COMMENT ON COLUMN workout_plans.weekly_volume_summary IS '每周各肌群训练组数总结，如 {"chest_sets": 12, "back_sets": 14}';
COMMENT ON COLUMN workout_plans.deload_schedule IS '减载周安排，如 {"deload_week": 5, "method": "volume_deload"}';
COMMENT ON COLUMN workout_plans.progression_plan IS '渐进超负荷计划描述';
COMMENT ON COLUMN workout_plans.warmup_guidance IS '热身指导';
COMMENT ON COLUMN workout_plans.recovery_notes IS '恢复建议';