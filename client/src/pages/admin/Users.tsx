import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { PublicUser, UserRole } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, X, Shield } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  agency_admin: "Agency Admin",
  analyst: "Analyst",
  account_manager: "Account Manager",
  client_viewer: "Client Viewer",
};

const ROLE_STYLE: Record<UserRole, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  agency_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  analyst: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  account_manager: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  client_viewer: "bg-muted text-muted-foreground",
};

const ALL_ROLES: UserRole[] = [
  "super_admin",
  "agency_admin",
  "analyst",
  "account_manager",
  "client_viewer",
];

export default function Users() {
  const { status } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("analyst");

  const { data, isLoading } = useQuery<{ data: PublicUser[] }>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: {
      username: string;
      password: string;
      email?: string;
      role: UserRole;
    }) => {
      const res = await apiRequest("POST", "/api/users", body);
      return res.json() as Promise<{ data: PublicUser }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setUsername("");
      setPassword("");
      setEmail("");
      setRole("analyst");
      setShowForm(false);
      toast({ title: `Account "${result.data.username}" created` });
    },
    onError: (err) => {
      toast({
        title: "Failed to create account",
        description: String(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Account removed" });
    },
    onError: (err) => {
      toast({ title: "Failed", description: String(err), variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    createMutation.mutate({
      username: username.trim(),
      password,
      email: email.trim() || undefined,
      role,
    });
  }

  const users = data?.data ?? [];
  const currentUserId = status?.user?.id;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[{ label: "Workflows", href: "/" }, { label: "User Management" }]}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create portal accounts for team members. Each person logs in separately.
          </p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New account
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-5 mb-6 bg-muted/30 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">New Portal Account</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username *</Label>
              <Input
                id="new-username"
                placeholder="jsmith"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Temporary password *</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Min 10 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email (optional)</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="jsmith@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">Role *</Label>
              <select
                id="new-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-3">
            <strong>Role permissions:</strong> Super Admin → Agency Admin → Analyst → Account Manager → Client Viewer (most restricted).
            Users can reset their own password once they have their recovery email set.
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setShowForm(false); setUsername(""); setPassword(""); setEmail(""); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending || !username.trim() || !password.trim()}>
              {createMutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <p className="text-muted-foreground text-sm">No other accounts yet.</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="border rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <span className="font-medium text-sm">{u.username}</span>
                  {u.email && (
                    <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                  )}
                  {u.id === currentUserId && (
                    <span className="text-xs text-muted-foreground ml-2">(you)</span>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${ROLE_STYLE[u.role]}`}>
                  {ROLE_LABELS[u.role]}
                </span>
              </div>
              {u.id !== currentUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(u.id)}
                  disabled={deleteMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  title="Remove account"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
