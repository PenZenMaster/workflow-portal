import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./queryClient";
import type { PublicUser } from "@shared/schema";

type AuthStatus = {
  needsSetup: boolean;
  authenticated: boolean;
  user: PublicUser | null;
  config?: {
    perplexityConfigured: boolean;
    ga4KeyConfigured: boolean;
  };
};

type AuthContextValue = {
  status: AuthStatus | undefined;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STATUS_KEY = ["/api/auth/status"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: status, isLoading } = useQuery<AuthStatus>({
    queryKey: STATUS_KEY,
  });

  const loginMut = useMutation({
    mutationFn: async (vars: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
  });

  const setupMut = useMutation({
    mutationFn: async (vars: { username: string; password: string; email?: string }) => {
      const res = await apiRequest("POST", "/api/auth/setup", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
  });

  const profileMut = useMutation({
    mutationFn: async (vars: { email: string }) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const logoutMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    },
  });

  const value: AuthContextValue = {
    status,
    isLoading,
    login: async (username, password) => {
      await loginMut.mutateAsync({ username, password });
    },
    setup: async (username, password, email) => {
      await setupMut.mutateAsync({ username, password, email });
    },
    logout: async () => {
      await logoutMut.mutateAsync();
    },
    updateProfile: async (email) => {
      await profileMut.mutateAsync({ email });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
