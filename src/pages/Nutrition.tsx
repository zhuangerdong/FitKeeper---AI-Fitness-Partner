
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const nutritionSchema = z.object({
  weight: z.number().min(30).max(300),
  height: z.number().min(100).max(250),
  age: z.number().min(10).max(100),
  gender: z.enum(['male', 'female']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  goal: z.enum(['lose_weight', 'gain_muscle', 'maintain']),
});

type NutritionFormValues = z.infer<typeof nutritionSchema>;

export default function Nutrition() {
  const { user } = useAuthStore();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NutritionFormValues>({
    resolver: zodResolver(nutritionSchema),
    defaultValues: {
      gender: 'male',
      activityLevel: 'moderate',
      goal: 'lose_weight',
    },
  });

  const calculateMacros = (data: NutritionFormValues) => {
    // Mifflin-St Jeor Equation
    let bmr = 10 * data.weight + 6.25 * data.height - 5 * data.age;
    if (data.gender === 'male') {
      bmr += 5;
    } else {
      bmr -= 161;
    }

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };

    let tdee = bmr * activityMultipliers[data.activityLevel];

    if (data.goal === 'lose_weight') {
      tdee -= 500;
    } else if (data.goal === 'gain_muscle') {
      tdee += 300;
    }

    const protein = data.weight * 2.2; // 2.2g per kg
    const fat = (tdee * 0.25) / 9;
    const carbs = (tdee - (protein * 4) - (fat * 9)) / 4;

    return {
      calories: Math.round(tdee),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
    };
  };

  const onSubmit = async (data: NutritionFormValues) => {
    setLoading(true);
    const calculated = calculateMacros(data);
    setResult(calculated);

    if (user) {
      // Save to database
      try {
        await supabase.from('nutrition_plans').insert({
          user_id: user.id,
          daily_calories: calculated.calories,
          protein_grams: calculated.protein,
          carbs_grams: calculated.carbs,
          fat_grams: calculated.fat,
          start_date: new Date().toISOString(),
          is_active: true,
        });
      } catch (error) {
        console.error('Error saving nutrition plan:', error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">AI Nutrition Advisor</h1>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Calculate Your Macros</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                {...register('weight', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              />
              {errors.weight && <span className="text-red-500 text-xs">{errors.weight.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Height (cm)</label>
              <input
                type="number"
                {...register('height', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              />
              {errors.height && <span className="text-red-500 text-xs">{errors.height.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Age</label>
              <input
                type="number"
                {...register('age', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              />
              {errors.age && <span className="text-red-500 text-xs">{errors.age.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Gender</label>
              <select
                {...register('gender')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Activity Level</label>
              <select
                {...register('activityLevel')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              >
                <option value="sedentary">Sedentary (little or no exercise)</option>
                <option value="light">Lightly active (1-3 days/week)</option>
                <option value="moderate">Moderately active (3-5 days/week)</option>
                <option value="active">Active (6-7 days/week)</option>
                <option value="very_active">Very active (physical job or 2x training)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Goal</label>
              <select
                {...register('goal')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              >
                <option value="lose_weight">Lose Weight</option>
                <option value="gain_muscle">Gain Muscle</option>
                <option value="maintain">Maintain Weight</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
          >
            {loading ? 'Calculating...' : 'Calculate Plan'}
          </button>
        </form>
      </div>

      {result && (
        <div className="bg-white p-6 rounded-lg shadow animate-fade-in">
          <h2 className="text-lg font-medium text-gray-900 mb-6">Your Daily Targets</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{result.calories}</div>
              <div className="text-sm text-gray-600">Calories</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{result.protein}g</div>
              <div className="text-sm text-gray-600">Protein</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{result.carbs}g</div>
              <div className="text-sm text-gray-600">Carbs</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{result.fat}g</div>
              <div className="text-sm text-gray-600">Fat</div>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">Recommended Foods</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border p-4 rounded-md">
                <h4 className="font-medium text-gray-900">Protein Sources</h4>
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                  <li>Chicken Breast (200g = ~62g protein)</li>
                  <li>Lean Beef (150g = ~39g protein)</li>
                  <li>Salmon (150g = ~30g protein)</li>
                </ul>
              </div>
              <div className="border p-4 rounded-md">
                <h4 className="font-medium text-gray-900">Carb Sources</h4>
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                  <li>Oats (50g = ~30g carbs)</li>
                  <li>Brown Rice (150g cooked = ~35g carbs)</li>
                  <li>Sweet Potato (200g = ~40g carbs)</li>
                </ul>
              </div>
              <div className="border p-4 rounded-md">
                <h4 className="font-medium text-gray-900">Healthy Fats</h4>
                <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                  <li>Avocado (half = ~15g fat)</li>
                  <li>Almonds (30g = ~14g fat)</li>
                  <li>Olive Oil (1 tbsp = ~14g fat)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
