
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dumbbell, Calendar, Clock, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

const workoutSchema = z.object({
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  goal: z.string().min(1),
  equipment: z.enum(['gym', 'dumbbells', 'bodyweight']),
  daysPerWeek: z.number().min(1).max(7),
});

type WorkoutFormValues = z.infer<typeof workoutSchema>;

export default function Workout() {
  const { user } = useAuthStore();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkoutFormValues>({
    resolver: zodResolver(workoutSchema),
    defaultValues: {
      experience: 'beginner',
      equipment: 'gym',
      daysPerWeek: 3,
    },
  });

  const generatePlan = (data: WorkoutFormValues) => {
    // Simplified logic for demo purposes
    const exercises = {
      chest: ['Bench Press', 'Incline Dumbbell Press', 'Push-ups'],
      back: ['Pull-ups', 'Bent Over Rows', 'Lat Pulldowns'],
      legs: ['Squats', 'Lunges', 'Leg Press'],
      shoulders: ['Overhead Press', 'Lateral Raises', 'Face Pulls'],
    };

    const schedule = [];
    const split = data.daysPerWeek === 3 ? ['Full Body', 'Full Body', 'Full Body'] :
                  data.daysPerWeek === 4 ? ['Upper', 'Lower', 'Upper', 'Lower'] :
                  ['Push', 'Pull', 'Legs', 'Push', 'Pull'];

    for (let i = 0; i < data.daysPerWeek; i++) {
      schedule.push({
        day: `Day ${i + 1}`,
        focus: split[i % split.length],
        exercises: [
          { name: exercises.chest[0], sets: 3, reps: '8-12' },
          { name: exercises.back[0], sets: 3, reps: '8-12' },
          { name: exercises.legs[0], sets: 3, reps: '10-15' },
          { name: exercises.shoulders[0], sets: 3, reps: '12-15' },
        ],
      });
    }

    return {
      name: `${data.goal} Plan`,
      schedule,
    };
  };

  const onSubmit = async (data: WorkoutFormValues) => {
    setLoading(true);
    const generatedPlan = generatePlan(data);
    setPlan(generatedPlan);

    if (user) {
      // Save to database
      try {
        await supabase.from('workout_plans').insert({
          user_id: user.id,
          plan_name: generatedPlan.name,
          difficulty_level: data.experience,
          days_per_week: data.daysPerWeek,
          exercises_schedule: generatedPlan.schedule,
          start_date: new Date().toISOString(),
          is_active: true,
        });
      } catch (error) {
        console.error('Error saving workout plan:', error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Workout Planner</h1>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create Your Plan</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Experience Level</label>
              <select
                {...register('experience')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              >
                <option value="beginner">Beginner (0-1 years)</option>
                <option value="intermediate">Intermediate (1-3 years)</option>
                <option value="advanced">Advanced (3+ years)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Goal</label>
              <input
                type="text"
                placeholder="e.g. Build Muscle, Strength"
                {...register('goal')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              />
              {errors.goal && <span className="text-red-500 text-xs">{errors.goal.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Equipment Access</label>
              <select
                {...register('equipment')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              >
                <option value="gym">Full Gym</option>
                <option value="dumbbells">Dumbbells Only</option>
                <option value="bodyweight">Bodyweight Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Days Per Week</label>
              <input
                type="number"
                {...register('daysPerWeek', { valueAsNumber: true })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
              />
              {errors.daysPerWeek && <span className="text-red-500 text-xs">{errors.daysPerWeek.message}</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
          >
            {loading ? 'Generating...' : 'Generate Plan'}
          </button>
        </form>
      </div>

      {plan && (
        <div className="space-y-6 animate-fade-in">
          <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plan.schedule.map((day: any, index: number) => (
              <div key={index} className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <div className="bg-orange-50 px-4 py-3 border-b border-orange-100 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-orange-800">{day.day}</h3>
                  <span className="text-xs font-medium bg-orange-200 text-orange-800 px-2 py-1 rounded-full">
                    {day.focus}
                  </span>
                </div>
                <div className="p-4">
                  <ul className="space-y-4">
                    {day.exercises.map((exercise: any, idx: number) => (
                      <li key={idx} className="flex items-start">
                        <Dumbbell className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{exercise.name}</p>
                          <div className="flex items-center mt-1 space-x-4 text-xs text-gray-500">
                            <span className="flex items-center">
                              <Activity className="h-3 w-3 mr-1" />
                              {exercise.sets} Sets
                            </span>
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {exercise.reps} Reps
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
      )}
    </div>
  );
}
