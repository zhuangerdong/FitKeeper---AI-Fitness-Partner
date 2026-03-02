
-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    birth_date DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
    activity_level VARCHAR(20) CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
    fitness_goal VARCHAR(20) CHECK (fitness_goal IN ('lose_weight', 'gain_muscle', 'maintain')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- 授权
GRANT SELECT ON users TO anon;
GRANT ALL PRIVILEGES ON users TO authenticated;

-- 创建身体数据表
CREATE TABLE IF NOT EXISTS body_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    weight DECIMAL(5,2) NOT NULL,
    height DECIMAL(5,2) NOT NULL,
    body_fat DECIMAL(4,2),
    record_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_body_data_user_id ON body_data(user_id);
CREATE INDEX IF NOT EXISTS idx_body_data_record_date ON body_data(record_date DESC);

-- 授权
GRANT SELECT ON body_data TO anon;
GRANT ALL PRIVILEGES ON body_data TO authenticated;

-- 创建营养计划表
CREATE TABLE IF NOT EXISTS nutrition_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    daily_calories INTEGER NOT NULL,
    protein_grams INTEGER NOT NULL,
    carbs_grams INTEGER NOT NULL,
    fat_grams INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_id ON nutrition_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_active ON nutrition_plans(is_active);

-- 授权
GRANT SELECT ON nutrition_plans TO anon;
GRANT ALL PRIVILEGES ON nutrition_plans TO authenticated;

-- 创建食物推荐表
CREATE TABLE IF NOT EXISTS food_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES nutrition_plans(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    food_name VARCHAR(100) NOT NULL,
    grams DECIMAL(6,2) NOT NULL,
    calories DECIMAL(6,2) NOT NULL,
    protein DECIMAL(5,2) NOT NULL,
    carbs DECIMAL(5,2) NOT NULL,
    fat DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_food_recommendations_plan_id ON food_recommendations(plan_id);
CREATE INDEX IF NOT EXISTS idx_food_recommendations_meal_type ON food_recommendations(meal_type);

-- 授权
GRANT SELECT ON food_recommendations TO anon;
GRANT ALL PRIVILEGES ON food_recommendations TO authenticated;

-- 创建训练计划表
CREATE TABLE IF NOT EXISTS workout_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL,
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    days_per_week INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
    exercises_schedule JSONB NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_active ON workout_plans(is_active);

-- 授权
GRANT SELECT ON workout_plans TO anon;
GRANT ALL PRIVILEGES ON workout_plans TO authenticated;

-- 创建对话历史表
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);

-- 授权
GRANT SELECT ON chat_history TO anon;
GRANT ALL PRIVILEGES ON chat_history TO authenticated;
