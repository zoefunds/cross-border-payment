"use client";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        try {
          const res = await authApi.getProfile();
          setProfile(res.data.user);
        } catch {
          setProfile(null);
        }
      } else {
        reset();
      }
      setLoading(false);
    });
    return unsub;
  }, [setFirebaseUser, setProfile, setLoading, reset]);

  return <>{children}</>;
}
