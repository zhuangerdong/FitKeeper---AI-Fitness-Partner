from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os
import json
from supabase import create_client, Client
from anthropic import AsyncAnthropic
import datetime
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Supabase credentials not found in environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

# Initialize Async Anthropic client
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL")

if not anthropic_api_key:
    raise ValueError("Anthropic API key not found in environment variables")

anthropic = AsyncAnthropic(
    api_key=anthropic_api_key,
    base_url=anthropic_base_url
)

# Load Knowledge Bases
# Note: RAG engine initialization is handled lazily in rag_system.py

# Pydantic models for request body
class ChatMessage(BaseModel):
    role: str
    content: Any  # content can be string or list of blocks

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    user_id: str

# Tools Definition
tools = [
    {
        "name": "get_user_profile",
        "description": "获取用户的个人资料，包括身高、体重、健身目标等",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "get_body_data",
        "description": "获取用户的体重记录历史",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "days": {"type": "number", "description": "获取最近几天的数据，默认7天"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "get_workout_plans",
        "description": "获取用户的训练计划",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "active_only": {"type": "boolean", "description": "只获取正在使用的计划"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "get_nutrition_plan",
        "description": "获取用户的营养计划",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "log_weight",
        "description": "记录用户今天的体重",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "weight": {"type": "number", "description": "体重(kg)"}
            },
            "required": ["user_id", "weight"]
        }
    },
    {
        "name": "update_nutrition_plan",
        "description": "更新用户的营养计划",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "daily_calories": {"type": "number", "description": "每日热量目标"},
                "protein_grams": {"type": "number", "description": "蛋白质(克)"},
                "carbs_grams": {"type": "number", "description": "碳水化合物(克)"},
                "fat_grams": {"type": "number", "description": "脂肪(克)"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "create_workout_plan",
        "description": "创建一个科学、个性化的训练计划并保存到数据库。必须基于用户资料、训练原则和动作数据库来设计。计划应包含周期化结构、渐进超负荷策略和恢复安排。",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "plan_name": {"type": "string", "description": "计划名称，如\"增肌训练计划\"、\"力量周期计划\""},
                "goal": {"type": "string", "enum": ["hypertrophy", "strength", "powerbuilding", "fat_loss", "general"], "description": "训练目标"},
                "difficulty_level": {"type": "string", "enum": ["beginner", "intermediate", "advanced"], "description": "难度等级"},
                "days_per_week": {"type": "number", "description": "每周训练天数(1-7)"},
                "periodization_type": {"type": "string", "enum": ["linear", "daily_undulating", "weekly_undulating", "block"], "description": "周期化类型"},
                "mesocycle_length_weeks": {"type": "number", "description": "中周期长度(周)，通常4-8周"},
                "exercises_schedule": {
                    "type": "array",
                    "description": "每天的训练安排",
                    "items": {
                        "type": "object",
                        "properties": {
                            "day": {"type": "string", "description": "如\"第 1 天\"或\"推日\""},
                            "day_type": {"type": "string", "enum": ["strength", "hypertrophy", "power", "recovery"], "description": "该日训练类型（用于周期化）"},
                            "focus": {"type": "string", "description": "训练重点，如\"胸+三头\"、\"背+二头\"、\"腿\"、\"上肢力量\""},
                            "exercises": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "name": {"type": "string", "description": "动作名称"},
                                        "type": {"type": "string", "enum": ["compound", "accessory", "isolation"], "description": "动作类型"},
                                        "primary_muscle": {"type": "string", "description": "主要目标肌群"},
                                        "sets": {"type": "number", "description": "组数"},
                                        "reps": {"type": "string", "description": "每组次数范围，如\"6-8\"、\"8-12\""},
                                        "intensity": {"type": "string", "description": "强度，如\"70-75% 1RM\"或\"RPE 7-8\""},
                                        "rest_seconds": {"type": "number", "description": "组间休息时间(秒)"},
                                        "progression_method": {"type": "string", "enum": ["double_progression", "linear", "rpe"], "description": "渐进方法"},
                                        "notes": {"type": "string", "description": "注意事项，如\"控制离心2秒\""},
                                        "alternative_exercises": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                            "description": "替代动作列表"
                                        }
                                    },
                                    "required": ["name", "sets", "reps"]
                                }
                            }
                        },
                        "required": ["day", "focus", "exercises"]
                    }
                },
                "weekly_volume_summary": {
                    "type": "object",
                    "description": "每周各肌群训练量总结",
                    "properties": {
                        "chest_sets": {"type": "number"},
                        "back_sets": {"type": "number"},
                        "shoulders_sets": {"type": "number"},
                        "biceps_sets": {"type": "number"},
                        "triceps_sets": {"type": "number"},
                        "quads_sets": {"type": "number"},
                        "hamstrings_sets": {"type": "number"},
                        "glutes_sets": {"type": "number"}
                    }
                },
                "deload_schedule": {
                    "type": "object",
                    "description": "减载周安排",
                    "properties": {
                        "deload_week": {"type": "number", "description": "减载周次（如第5周）"},
                        "method": {"type": "string", "enum": ["volume_deload", "intensity_deload", "full_deload"], "description": "减载方式"}
                    }
                },
                "progression_plan": {
                    "type": "string",
                    "description": "渐进超负荷计划描述，如\"每周尝试增加2.5kg或增加1-2次\""
                },
                "warmup_guidance": {
                    "type": "string",
                    "description": "热身指导"
                },
                "recovery_notes": {
                    "type": "string",
                    "description": "恢复建议"
                }
            },
            "required": ["user_id", "plan_name", "goal", "difficulty_level", "days_per_week", "exercises_schedule"]
        }
    },
    {
        "name": "update_user_profile",
        "description": "更新用户的个人资料信息。当用户提到身高、体重、性别、出生日期、活动水平、健身目标时，主动调用此工具保存。",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "height": {"type": "number", "description": "身高(cm)"},
                "weight": {"type": "number", "description": "体重(kg)"},
                "gender": {"type": "string", "enum": ["male", "female"], "description": "性别"},
                "birth_date": {"type": "string", "description": "出生日期，格式 YYYY-MM-DD"},
                "activity_level": {"type": "string", "enum": ["sedentary", "light", "moderate", "active", "very_active"], "description": "活动水平"},
                "fitness_goal": {"type": "string", "enum": ["lose_weight", "gain_muscle", "maintain"], "description": "健身目标"},
                "name": {"type": "string", "description": "用户名"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "calculate_nutrition_plan",
        "description": "根据用户的身体数据计算个性化的营养计划。会自动从数据库读取用户最新的个人资料（身高、体重、年龄、性别、活动水平、目标）进行计算。如果提供了参数，则优先使用参数值。",
        "input_schema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "用户ID"},
                "weight": {"type": "number", "description": "体重(kg)"},
                "height": {"type": "number", "description": "身高(cm)"},
                "age": {"type": "number", "description": "年龄"},
                "gender": {"type": "string", "enum": ["male", "female"], "description": "性别"},
                "activity_level": {"type": "string", "enum": ["sedentary", "light", "moderate", "active", "very_active"], "description": "活动水平"},
                "goal": {"type": "string", "enum": ["lose_weight", "gain_muscle", "maintain"], "description": "健身目标"}
            },
            "required": ["user_id"]
        }
    },
    {
        "name": "get_training_guidelines",
        "description": "获取基础训练原则和指南（分化方案、训练量标准、组次范围、渐进超负荷、恢复建议等）。在设计训练计划或回答训练相关问题时调用。",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_scientific_training_knowledge",
        "description": "获取科学训练知识库，包含周期化训练、SRA曲线、容量指南、次数范围研究、渐进超负荷方法等科学依据。设计训练计划时必须调用此工具获取最新研究支持的训练参数。",
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {
                    "type": "string",
                    "enum": ["periodization", "volume_guidelines", "rep_ranges", "sra_curve", "progressive_overload", "deload", "session_structure", "split_recommendations", "goal_specific_programming", "all"],
                    "description": "要获取的知识主题，默认获取全部"
                }
            },
            "required": []
        }
    },
    {
        "name": "query_exercise_db",
        "description": "从动作数据库中按肌群和器材查询推荐动作。可一次查询多个肌群。",
        "input_schema": {
            "type": "object",
            "properties": {
                "muscles": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["chest", "lats", "middle back", "lower back", "traps", "shoulders", "biceps", "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves", "abdominals", "abductors", "adductors", "neck"]},
                    "description": "要查询的肌群列表"
                },
                "equipment": {
                    "type": "string",
                    "enum": ["gym", "dumbbell", "bodyweight"],
                    "description": "器材类型"
                }
            },
            "required": ["muscles"]
        }
    }
]

# Load Knowledge Bases
try:
    with open('data/fitness_knowledge_base.json', 'r', encoding='utf-8') as f:
        fitness_kb = json.load(f)
except Exception as e:
    print(f"Warning: Could not load fitness knowledge base: {e}")
    fitness_kb = {}

try:
    with open('data/scientific_training_knowledge.json', 'r', encoding='utf-8') as f:
        scientific_kb = json.load(f)
except Exception as e:
    print(f"Warning: Could not load scientific training knowledge base: {e}")
    scientific_kb = {}

async def execute_tool(name: str, args: Dict[str, Any]) -> Any:
    user_id = args.get("user_id")
    params = {k: v for k, v in args.items() if k != "user_id"}

    if name == "get_user_profile":
        response = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if not response.data:
             return {"error": "User not found"}
        return response.data

    elif name == "get_body_data":
        days = params.get("days", 7)
        response = supabase.table("body_data").select("*").eq("user_id", user_id).order("record_date", desc=True).limit(days).execute()
        return response.data

    elif name == "get_workout_plans":
        query = supabase.table("workout_plans").select("*").eq("user_id", user_id).order("created_at", desc=True)
        if params.get("active_only"):
            query = query.eq("is_active", True)
        response = query.execute()
        return response.data

    elif name == "get_nutrition_plan":
        response = supabase.table("nutrition_plans").select("*").eq("user_id", user_id).eq("is_active", True).single().execute()
        # Supabase Python client might raise exception or return empty data on single() not found
        # Need to handle based on library version, assuming empty list or None if not found
        if not response.data:
            return None
        return response.data

    elif name == "log_weight":
        today = datetime.date.today().isoformat()
        weight = params.get("weight")
        
        # Update user profile
        supabase.table("users").update({"weight": weight, "updated_at": datetime.datetime.now().isoformat()}).eq("id", user_id).execute()

        # Check existing record
        existing = supabase.table("body_data").select("*").eq("user_id", user_id).eq("record_date", today).execute()
        
        if existing.data and len(existing.data) > 0:
            record_id = existing.data[0]['id']
            response = supabase.table("body_data").update({"weight": weight}).eq("id", record_id).execute()
            return {"success": True, "message": f"已更新今天的体重记录: {weight}kg", "data": response.data}
        else:
            response = supabase.table("body_data").insert({
                "user_id": user_id,
                "weight": weight,
                "record_date": today
            }).execute()
            return {"success": True, "message": f"已记录今天的体重: {weight}kg", "data": response.data}

    elif name == "update_nutrition_plan":
        existing = supabase.table("nutrition_plans").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        
        if existing.data and len(existing.data) > 0:
            record_id = existing.data[0]['id']
            update_data = {}
            if "daily_calories" in params: update_data["daily_calories"] = params["daily_calories"]
            if "protein_grams" in params: update_data["protein_grams"] = params["protein_grams"]
            if "carbs_grams" in params: update_data["carbs_grams"] = params["carbs_grams"]
            if "fat_grams" in params: update_data["fat_grams"] = params["fat_grams"]
            
            response = supabase.table("nutrition_plans").update(update_data).eq("id", record_id).execute()
            return {"success": True, "message": "营养计划已更新", "data": response.data}
        else:
            insert_data = {
                "user_id": user_id,
                "daily_calories": params.get("daily_calories", 2000),
                "protein_grams": params.get("protein_grams", 150),
                "carbs_grams": params.get("carbs_grams", 200),
                "fat_grams": params.get("fat_grams", 65),
                "start_date": datetime.datetime.now().isoformat(),
                "is_active": True
            }
            response = supabase.table("nutrition_plans").insert(insert_data).execute()
            return {"success": True, "message": "已创建新的营养计划", "data": response.data}

    elif name == "create_workout_plan":
        # Deactivate existing plans
        supabase.table("workout_plans").update({"is_active": False}).eq("user_id", user_id).execute()

        insert_data = {
            "user_id": user_id,
            "plan_name": params["plan_name"],
            "difficulty_level": params["difficulty_level"],
            "days_per_week": params["days_per_week"],
            "exercises_schedule": params["exercises_schedule"],
            "start_date": datetime.datetime.now().isoformat(),
            "is_active": True
        }
        
        # Add optional fields
        optional_fields = ["goal", "periodization_type", "mesocycle_length_weeks", "weekly_volume_summary", 
                           "deload_schedule", "progression_plan", "warmup_guidance", "recovery_notes"]
        for field in optional_fields:
            if field in params:
                insert_data[field] = params[field]

        response = supabase.table("workout_plans").insert(insert_data).execute()
        data = response.data[0] if response.data else {}

        # Build response message
        volume_info = ""
        if "weekly_volume_summary" in params:
            vol = params["weekly_volume_summary"]
            volume_info = f"\n\n📊 **每周训练容量：**\n- 胸部：{vol.get('chest_sets', 0)} 组\n- 背部：{vol.get('back_sets', 0)} 组\n- 肩部：{vol.get('shoulders_sets', 0)} 组\n- 二头：{vol.get('biceps_sets', 0)} 组\n- 三头：{vol.get('triceps_sets', 0)} 组\n- 股四头：{vol.get('quads_sets', 0)} 组\n- 腘绳肌：{vol.get('hamstrings_sets', 0)} 组\n- 臀部：{vol.get('glutes_sets', 0)} 组"

        periodization_info = ""
        if "periodization_type" in params:
            period_names = {
                'linear': '线性周期化',
                'daily_undulating': '每日波动周期化',
                'weekly_undulating': '每周波动周期化',
                'block': '板块周期化'
            }
            period_type = params["periodization_type"]
            periodization_info = f"\n\n📅 **周期化类型：** {period_names.get(period_type, period_type)}"
            if "mesocycle_length_weeks" in params:
                periodization_info += f"（{params['mesocycle_length_weeks']}周中周期）"

        deload_info = ""
        if "deload_schedule" in params:
            deload = params["deload_schedule"]
            methods = {
                'volume_deload': '减少组数',
                'intensity_deload': '降低重量',
                'full_deload': '全面减载'
            }
            method = deload.get("method", "")
            deload_info = f"\n\n🔄 **减载安排：** 第{deload.get('deload_week')}周 - {methods.get(method, method)}"

        return {
            "success": True,
            "message": f"训练计划\"{params['plan_name']}\"已创建并设为当前使用计划{volume_info}{periodization_info}{deload_info}",
            "plan_id": data.get("id"),
            "data": data
        }

    elif name == "update_user_profile":
        update_data = {"updated_at": datetime.datetime.now().isoformat()}
        fields = ["height", "weight", "gender", "birth_date", "activity_level", "fitness_goal", "name"]
        for field in fields:
            if field in params:
                update_data[field] = params[field]
        
        response = supabase.table("users").update(update_data).eq("id", user_id).execute()
        data = response.data[0] if response.data else {}

        # Sync weight to body_data
        if "weight" in params:
            today = datetime.date.today().isoformat()
            existing = supabase.table("body_data").select("id").eq("user_id", user_id).eq("record_date", today).execute()
            
            if existing.data:
                record_id = existing.data[0]['id']
                supabase.table("body_data").update({"weight": params["weight"]}).eq("id", record_id).execute()
            else:
                supabase.table("body_data").insert({
                    "user_id": user_id,
                    "weight": params["weight"],
                    "height": params.get("height", data.get("height", 170)),
                    "record_date": today
                }).execute()

        updated = []
        if "height" in params: updated.append(f"身高: {params['height']}cm")
        if "weight" in params: updated.append(f"体重: {params['weight']}kg")
        if "gender" in params: updated.append(f"性别: {'男' if params['gender'] == 'male' else '女'}")
        if "birth_date" in params: updated.append(f"出生日期: {params['birth_date']}")
        if "activity_level" in params: updated.append(f"活动水平: {params['activity_level']}")
        if "fitness_goal" in params: updated.append(f"健身目标: {params['fitness_goal']}")
        if "name" in params: updated.append(f"用户名: {params['name']}")

        return {"success": True, "message": f"已更新个人资料: {', '.join(updated)}", "data": data}

    elif name == "calculate_nutrition_plan":
        # Fetch latest profile from DB
        profile_response = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if not profile_response.data:
            return {"error": "User profile not found. Please update profile first."}
        
        user_profile = profile_response.data
        
        # Use params if provided, else fallback to DB
        weight = params.get("weight", user_profile.get("weight"))
        height = params.get("height", user_profile.get("height"))
        
        # Calculate age if not provided but birth_date exists
        age = params.get("age")
        if age is None and user_profile.get("birth_date"):
            birth_date = datetime.datetime.strptime(user_profile["birth_date"], "%Y-%m-%d")
            today = datetime.date.today()
            age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
        
        gender = params.get("gender", user_profile.get("gender"))
        activity_level = params.get("activity_level", user_profile.get("activity_level"))
        goal = params.get("goal", user_profile.get("fitness_goal"))

        # Validate required fields
        missing = []
        if not weight: missing.append("weight")
        if not height: missing.append("height")
        if not age: missing.append("age")
        if not gender: missing.append("gender")
        if not activity_level: missing.append("activity_level")
        if not goal: missing.append("goal")
        
        if missing:
            return {"error": f"Missing required data: {', '.join(missing)}. Please update profile first."}

        # Mifflin-St Jeor Formula
        bmr = 10 * weight + 6.25 * height - 5 * age
        if gender == 'male':
            bmr += 5
        else:
            bmr -= 161

        activity_multipliers = {
            "sedentary": 1.2,
            "light": 1.375,
            "moderate": 1.55,
            "active": 1.725,
            "very_active": 1.9,
        }

        raw_tdee = bmr * activity_multipliers.get(activity_level, 1.2)
        target_calories = raw_tdee

        calorie_adjustment = ""
        if goal == "lose_weight":
            deficit_tdee = raw_tdee * 0.80
            min_calories = max(bmr, 1500) if gender == 'male' else max(bmr, 1200)
            target_calories = max(deficit_tdee, min_calories)
            actual_deficit = round(raw_tdee - target_calories)
            calorie_adjustment = f"减脂期：TDEE {round(raw_tdee)} × 0.8，热量缺口 {actual_deficit} kcal/天"
        elif goal == "gain_muscle":
            target_calories = raw_tdee + 250
            calorie_adjustment = "增肌期：热量盈余 250 kcal"
        else:
            calorie_adjustment = "维持期：保持 TDEE 热量"

        # Macros Calculation
        if goal == "lose_weight":
            protein_per_kg = 2.0
        elif goal == "gain_muscle":
            protein_per_kg = 1.8
        else:
            protein_per_kg = 1.6
            
        protein = round(weight * protein_per_kg)
        protein_calories = protein * 4

        fat_ratio = 0.25 if goal == "lose_weight" else 0.30
        fat_calories = target_calories * fat_ratio
        fat = round(fat_calories / 9)

        min_fat = round(weight * 0.8)
        if fat < min_fat:
            fat = min_fat
            fat_calories = fat * 9
        
        carb_calories = max(target_calories - protein_calories - fat_calories, 0)
        carbs = round(carb_calories / 4)

        nutrition_plan = {
            "calories": round(target_calories),
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
            "bmr": round(bmr),
            "tdee": round(raw_tdee),
            "macros_breakdown": {
                "protein_pct": round((protein_calories / target_calories) * 100),
                "fat_pct": round((fat_calories / target_calories) * 100),
                "carbs_pct": round((carb_calories / target_calories) * 100)
            }
        }

        # Save to DB
        supabase.table("nutrition_plans").update({"is_active": False}).eq("user_id", user_id).execute()

        response = supabase.table("nutrition_plans").insert({
            "user_id": user_id,
            "daily_calories": nutrition_plan["calories"],
            "protein_grams": nutrition_plan["protein"],
            "carbs_grams": nutrition_plan["carbs"],
            "fat_grams": nutrition_plan["fat"],
            "start_date": datetime.datetime.now().isoformat(),
            "is_active": True
        }).execute()

        return {
            "success": True,
            "message": "营养计划已计算并保存",
            "calculation": {
                "formula": "Mifflin-St Jeor Equation",
                "bmr": round(bmr),
                "tdee_before_adjustment": round(raw_tdee),
                "activity_multiplier": activity_multipliers.get(activity_level, 1.2),
                "adjustment": calorie_adjustment,
                "target_calories": round(target_calories),
                "protein_per_kg": protein_per_kg,
            },
            "plan": nutrition_plan,
            "data": response.data[0] if response.data else {}
        }

    elif name == "get_training_guidelines":
        return fitness_kb.get("training_principles", {})

    elif name == "get_scientific_training_knowledge":
        topic = params.get("topic", "all")
        if topic == "all":
            return scientific_kb
        return scientific_kb.get(topic, {"error": f"Topic '{topic}' not found"})

    elif name == "query_exercise_db":
        muscles = params.get("muscles", [])
        equipment = params.get("equipment")
        db = fitness_kb.get("curated_exercises_by_muscle_and_equipment", {})
        results = {}
        
        for muscle in muscles:
            if muscle not in db: continue
            if equipment and equipment in db[muscle]:
                results[muscle] = db[muscle][equipment]
            else:
                results[muscle] = db[muscle]
        return results

    return {"error": f"Unknown tool: {name}"}


@router.post("/")
async def chat_handler(request: ChatRequest):
    messages = request.messages
    user_id = request.user_id

    system_prompt = f"""你是 FitKeeper 的 AI 健身助手，一个基于科学研究的私人教练和营养师。

## 你的能力
你可以通过工具访问和修改用户的数据：
- 查看用户资料、体重记录、训练计划、营养计划
- 记录体重、更新营养计划
- **更新用户个人资料**（身高、体重、性别、出生日期、活动水平、健身目标）
- **创建训练计划**（基于科学研究的个性化训练计划）
- **获取知识库**：通过 get_scientific_training_knowledge 获取科学训练原理，通过 query_exercise_db 查询动作库。设计训练计划前必须调用。

## 沟通风格
- 友好、专业、鼓励性
- 回答简洁但有用
- 适当使用 emoji
- 如果涉及医疗建议，提醒用户咨询医生

## ========== 咨询式交互（最重要！） ==========

⚠️ **严格规则：当用户请求创建训练计划时，你必须分多轮对话逐步收集信息，绝不能一次性生成计划！** ⚠️

### 第一轮：了解基本情况
问用户这4个问题（可以一次问完，让用户逐个回答）：
1. **训练经验**：你之前有系统的训练经历吗？练了多久？
2. **主要目标**：你希望达到什么目标？（增肌/减脂/力量/综合体能等）
3. **时间安排**：每周能训练几天？每次大概多长时间？
4. **器材条件**：你有健身房吗？家里有哑铃？还是只能徒手？

### 第二轮：深入需求（根据用户回答追问）
等用户回答后，根据情况追问：
- 减脂目标：体脂大概多少？有做过体测吗？饮食控制如何？
- 增肌目标：有特别想加强的部位吗？
- 新手：有没有运动基础？有没有伤病？
- 有经验者：目前用什么训练分化？遇到什么瓶颈？

### 第三轮：了解偏好和限制
- 喜欢什么样的训练风格？（大重量/高容量/功能性？）
- 有没有不喜欢做的动作或伤病需要避免？
- 恢复能力如何？睡眠质量好吗？

### 第四轮：确认后调用工具创建
**只有**当你收集完所有必要信息并得到用户确认后，才能调用 create_workout_plan 工具！

## ========== 科学训练计划创建流程 ==========

创建训练计划时，必须严格遵循以下科学原则：

### 确定基础参数（基于研究）

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

## 重要：主动记录用户信息
当用户在对话中提到以下任何信息时，你必须**立即调用 update_user_profile 工具**保存：
- 身高、体重、性别、年龄或出生日期
- 活动水平、健身目标

## 常见问题的科学回答

**"增肌应该用多大重量？"**
- 6-12次范围效果略好，但1-30次都能增肌
- 关键是接近力竭（RPE 7-9）和渐进超负荷

**"多久练一次同一肌群？"**
- 基于SRA曲线：新手48-96小时，高级24-36小时
- 实际：新手2-3次/周，中高级2次/周即可

用户ID: {user_id}
当前日期: {datetime.date.today().strftime('%Y-%m-%d')}"""

    # Context Pruning: keep recent 10 messages to save tokens and improve speed
    conversation_messages = []
    for msg in messages:
        if msg.role != "system":
            conversation_messages.append({
                "role": "assistant" if msg.role == "assistant" else "user",
                "content": msg.content
            })
            
    if len(conversation_messages) > 12:
        # Keep first 2 (context) and last 10
        conversation_messages = conversation_messages[:2] + conversation_messages[-10:]

    async def generate_stream():
        nonlocal conversation_messages
        rounds = 0
        max_rounds = 5
        
        while rounds < max_rounds:
            rounds += 1
            has_tool_use = False
            
            try:
                # We use stream=True for raw event streaming
                stream = await anthropic.messages.create(
                    model=os.getenv("ANTHROPIC_MODEL", "qwen3.5-plus"),
                    max_tokens=4096,
                    system=system_prompt,
                    tools=tools,
                    messages=conversation_messages,
                    stream=True
                )
                
                assistant_blocks = []
                current_block_index = -1
                
                tool_use_id = None
                tool_name = None
                tool_input_json = ""
                
                async for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "text":
                            assistant_blocks.append({"type": "text", "text": ""})
                        elif event.content_block.type == "tool_use":
                            has_tool_use = True
                            tool_use_id = event.content_block.id
                            tool_name = event.content_block.name
                            tool_input_json = ""
                            assistant_blocks.append({"type": "tool_use", "id": tool_use_id, "name": tool_name, "input": {}})
                            
                            yield f"data: {json.dumps({'type': 'tool_start', 'name': tool_name})}\n\n"
                            
                    elif event.type == "content_block_delta":
                        # We use the last added block
                        if not assistant_blocks: continue
                        last_block = assistant_blocks[-1]
                        
                        if event.delta.type == "text_delta" and last_block["type"] == "text":
                            last_block["text"] += event.delta.text
                            yield f"data: {json.dumps({'type': 'text', 'content': event.delta.text})}\n\n"
                        elif event.delta.type == "input_json_delta" and last_block["type"] == "tool_use":
                            tool_input_json += event.delta.partial_json
                            
                    elif event.type == "content_block_stop":
                        if not assistant_blocks: continue
                        last_block = assistant_blocks[-1]
                        
                        if has_tool_use and last_block["type"] == "tool_use":
                            try:
                                args = json.loads(tool_input_json)
                                last_block["input"] = args
                            except json.JSONDecodeError:
                                args = {}
                                last_block["input"] = args
                
                # Append assistant message to history
                conversation_messages.append({
                    "role": "assistant",
                    "content": assistant_blocks
                })
                
                if has_tool_use:
                    # Execute tool
                    last_tool_block = next((b for b in reversed(assistant_blocks) if b["type"] == "tool_use"), None)
                    if last_tool_block:
                        tool_args = last_tool_block["input"]
                        tool_args["user_id"] = user_id
                        
                        try:
                            result = await execute_tool(tool_name, tool_args)
                            
                            # Special handling to notify frontend of created plan
                            if tool_name == "create_workout_plan" and isinstance(result, dict) and result.get("success"):
                                yield f"data: {json.dumps({'type': 'plan_created', 'plan_id': result.get('plan_id')})}\n\n"
                                
                        except Exception as e:
                            # Self-Correction: pass error back to model
                            result = {"error": f"Tool execution failed: {str(e)}. Please correct the arguments and try again."}
                            
                        # Yield tool end to frontend
                        yield f"data: {json.dumps({'type': 'tool_end', 'name': tool_name})}\n\n"
                        
                        # Append tool result to history and loop again
                        conversation_messages.append({
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": json.dumps(result, default=str)
                            }]
                        })
                else:
                    # No tool use, generation finished
                    break
                    
            except Exception as e:
                print(f"Agent error in stream: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break
                
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")
