import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Platform } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cpu, Trash2 } from "lucide-react";

export default function Platforms() {
  const { status } = useAuth();
  const { toast } = useToast();

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

  const platforms = data?.data ?? [];
  const configuredSlugs = status?.config?.configuredPlatforms ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Back to Workflows
        </Link>
      </div>

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
    </div>
  );
}
