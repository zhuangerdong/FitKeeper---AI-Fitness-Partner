
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  email: string;
  name: string;
  height?: number | null;
  weight?: number | null;
  birth_date?: string | null;
  gender?: 'male' | 'female' | null;
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  fitness_goal?: 'lose_weight' | 'gain_muscle' | 'maintain' | null;
  created_at?: string;
  updated_at?: string;
}

interface AuthState {
  user: User | null;
  session: any | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: any | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
