import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface AuthState {
  user:          User | null;
  authReady:     boolean;    // true once onAuthStateChanged fires for the first time
  syncReady:     boolean;    // true after initial cloud/local decision is resolved
  setUser:       (u: User | null) => void;
  setAuthReady:  (v: boolean) => void;
  setSyncReady:  (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:          null,
  authReady:     false,
  syncReady:     false,
  setUser:       (user)       => set({ user }),
  setAuthReady:  (authReady)  => set({ authReady }),
  setSyncReady:  (syncReady)  => set({ syncReady }),
}));
