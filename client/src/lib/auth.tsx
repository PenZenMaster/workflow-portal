import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "./queryClient";
import type { PublicUser } from "@shared/schema";

type AuthStatus = {
  needsSetup: boolean;
  authenticated: boolean;
  user: PublicUser | null;
};

type AuthContextValue = {
  status: AuthStatus | undefined;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
    mutationFn: async (vars: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/setup", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
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
    setup: async (username, password) => {
      await setupMut.mutateAsync({ username, password });
    },
    logout: async () => {
      await logoutMut.mutateAsync();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
