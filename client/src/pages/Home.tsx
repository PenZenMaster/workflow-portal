import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Workflow } from "@shared/schema";
import { CATEGORIES } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, Moon, Sun, Lock, LogOut, User, Settings, BarChart2, Users, Activity } from "lucide-react";
import { Link } from "wouter";
import { Logo } from "@/components/Logo";
import { WorkflowCard } from "@/components/WorkflowCard";
import { WorkflowDialog } from "@/components/WorkflowDialog";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const ALL = "All";

export default function Home() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const { status, logout, updateProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [deleting, setDeleting] = useState<Workflow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const { data: workflows, isLoading } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
  });

  const pinMutation = useMutation({
    mutationFn: async (w: Workflow) => {
      return apiRequest("PUT", `/api/workflows/${w.id}`, {
        name: w.name,
        category: w.category,
        description: w.description,
        inputs: w.inputs,
        tags: w.tags,
        prompt: w.prompt,
        launchUrl: w.launchUrl,
        launchLabel: w.launchLabel,
        pinned: !w.pinned,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (w: Workflow) => {
      return apiRequest("DELETE", `/api/workflows/${w.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow deleted" });
      setDeleting(null);
    },
  });

  const filtered = useMemo(() => {
    if (!workflows) return [];
    const q = search.trim().toLowerCase();
    return workflows.filter((w) => {
      if (activeCategory !== ALL && w.category !== activeCategory) return false;
      if (!q) return true;
      const haystack = [
        w.name,
        w.description,
        w.category,
        w.prompt,
        w.launchLabel,
        ...w.inputs,
        ...w.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [workflows, search, activeCategory]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { [ALL]: workflows?.length ?? 0 };
    for (const c of CATEGORIES) map[c] = 0;
    for (const w of workflows ?? []) {
      map[w.category] = (map[w.category] ?? 0) + 1;
    }
    return map;
  }, [workflows]);

  const visibleCategories = [ALL, ...CATEGORIES.filter((c) => (counts[c] ?? 0) > 0)];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight" data-testid="text-app-title">
                Workflow Portal
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider">
                <Lock className="h-3 w-3" />
                Private — agency workflows
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <Link
            href="/ai/clients"
            className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mr-2"
            title="AI Visibility"
          >
            <BarChart2 className="h-4 w-4" />
            AI Visibility
          </Link>

          {status?.user?.role === "super_admin" && (
            <Link
              href="/admin/users"
              className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mr-2"
              title="Manage users"
            >
              <Users className="h-4 w-4" />
              Users
            </Link>
          )}

          {status?.user?.role === "super_admin" && (
            <Link
              href="/admin/jobs"
              className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mr-2"
              title="Job queue"
            >
              <Activity className="h-4 w-4" />
              Jobs
            </Link>
          )}

          {status?.user && (
            <div
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground mr-1"
              data-testid="text-current-user"
            >
              <User className="h-3.5 w-3.5" />
              {status.user.username}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            data-testid="button-theme-toggle"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setProfileEmail(status?.user?.email ?? "");
              setProfileError(null);
              setSettingsOpen(true);
            }}
            title="Account settings"
            data-testid="button-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            title="Sign out"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            data-testid="button-new-workflow"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New workflow
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <section className="mb-6">
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search workflows by name, description, input, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 text-base"
              data-testid="input-search"
            />
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {visibleCategories.map((c) => {
              const active = c === activeCategory;
              return (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  data-testid={`filter-${c.toLowerCase().replace(/\s+/g, "-")}`}
                  className={
                    "px-3 py-1.5 rounded-full text-sm border transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-card-border text-muted-foreground hover:text-foreground hover-elevate")
                  }
                >
                  {c}
                  <span className="ml-1.5 text-xs opacity-70">{counts[c] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">
              {workflows?.length === 0
                ? "No workflows yet. Add your first one."
                : "No workflows match your search."}
            </p>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              data-testid="button-empty-new"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add workflow
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((w) => (
              <WorkflowCard
                key={w.id}
                workflow={w}
                onEdit={(workflow) => {
                  setEditing(workflow);
                  setDialogOpen(true);
                }}
                onDelete={(workflow) => setDeleting(workflow)}
                onTogglePin={(workflow) => pinMutation.mutate(workflow)}
              />
            ))}
          </div>
        )}

        <footer className="mt-16 pt-6 border-t border-border text-xs text-muted-foreground flex flex-wrap gap-3 justify-between">
          <span>
            {workflows?.length ?? 0} workflow{(workflows?.length ?? 0) === 1 ? "" : "s"} catalogued
          </span>
          <span>One place for your best agency workflows.</span>
        </footer>
      </main>

      <WorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Account settings</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setProfileError(null);
              setProfileBusy(true);
              try {
                await updateProfile(profileEmail.trim());
                toast({ title: "Email address saved" });
                setSettingsOpen(false);
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes("409")) {
                  setProfileError("That email is already in use.");
                } else {
                  setProfileError("Failed to save. Try again.");
                }
              } finally {
                setProfileBusy(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Recovery email</Label>
              <Input
                id="profile-email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used to receive password reset links.
              </p>
            </div>
            {profileError && (
              <p className="text-sm text-destructive">{profileError}</p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={profileBusy}>
                {profileBusy ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleting?.name}</strong> from your portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
