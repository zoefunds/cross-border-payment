import { create } from "zustand";
import { User as FirebaseUser } from "firebase/auth";
import { User } from "@/lib/api";

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile:      User | null;
  loading:      boolean;
  setFirebaseUser: (user: FirebaseUser | null) => void;
  setProfile:      (profile: User | null) => void;
  setLoading:      (loading: boolean) => void;
  reset:           () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  profile:      null,
  loading:      true,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setProfile:      (profile)      => set({ profile }),
  setLoading:      (loading)      => set({ loading }),
  reset: () => set({ firebaseUser: null, profile: null, loading: false }),
}));
