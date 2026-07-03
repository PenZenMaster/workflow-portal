import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Platform } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cpu, Trash2 } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export default function Platforms() {
  const { status } = useAuth();
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");

  const { data, isLoading } = useQuery<{ data: Platform[] }>({
    queryKey: ["/api/platforms"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/platforms/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
    },
    onError: (err) =>
      toast({ title: "Failed to update platform", description: String(err), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/platforms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      toast({ title: "Platform removed" });
    },
    onError: (err) =>
      toast({ title: "Failed to delete platform", description: String(err), variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/platforms", { slug, displayName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });
      toast({ title: "Platform added" });
      setSlug("");
      setDisplayName("");
    },
    onError: (err) =>
      toast({ title: "Failed to add platform", description: String(err), variant: "destructive" }),
  });

  const platforms = data?.data ?? [];
  const configuredSlugs = status?.config?.configuredPlatforms ?? [];
  const canSubmit = SLUG_PATTERN.test(slug) && displayName.trim().length > 0;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumbs
        items={[{ label: "Workflows", href: "/" }, { label: "AI Platforms" }]}
      />

      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Cpu className="h-6 w-6 text-primary" />
        AI Platforms
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Enable or disable AI platforms used for visibility runs. Connection status
        reflects API keys configured in the server environment.
      </p>

      {platforms.length === 0 ? (
        <p className="text-muted-foreground text-sm">No platforms configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {platforms.map((p) => {
            const connected = configuredSlugs.includes(p.slug);
            return (
              <li key={p.id} className="border rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="font-medium text-sm">{p.displayName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.slug}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      connected
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {connected ? "Connected" : "Not configured"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: p.id, enabled: checked })}
                    disabled={toggleMutation.isPending}
                    aria-label={p.displayName}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete ${p.displayName}`}
                    title="Delete platform"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="mt-8 border rounded-lg p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Add platform</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="platform-slug">Slug</Label>
            <Input
              id="platform-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-platform"
            />
          </div>
          <div>
            <Label htmlFor="platform-display-name">Display name</Label>
            <Input
              id="platform-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Platform"
            />
          </div>
        </div>
        <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
          Add platform
        </Button>
        {createMutation.isError && (
          <p className="text-sm text-destructive">{String(createMutation.error)}</p>
        )}
      </form>
    </div>
  );
}
