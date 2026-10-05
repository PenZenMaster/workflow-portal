import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiTokenRow {
  id: number;
  clientId: number;
  name: string;
  tokenPrefix: string;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

interface CreatedApiToken extends ApiTokenRow {
  token: string;
}

const LIFETIME_OPTIONS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "365 days" },
];
const DEFAULT_TTL_DAYS = 90;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

function tokenStatus(t: ApiTokenRow): "Active" | "Revoked" | "Expired" {
  if (t.revokedAt !== null) return "Revoked";
  if (t.expiresAt <= Date.now()) return "Expired";
  return "Active";
}

// Admin-only: the list endpoint is limited to super_admin / agency_admin, so
// this section renders nothing for any other role (403 -> isError).
export function ApiAccessSection({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const listKey = `/api/clients/${clientId}/api-tokens`;
  const [name, setName] = useState("");
  const [ttlDays, setTtlDays] = useState(DEFAULT_TTL_DAYS);
  const [newToken, setNewToken] = useState<CreatedApiToken | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<{ data: ApiTokenRow[] }>({
    queryKey: [listKey],
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", listKey, { name: name.trim(), ttlDays });
      return (await res.json()) as { data: CreatedApiToken };
    },
    onSuccess: (body) => {
      setNewToken(body.data);
      setName("");
      queryClient.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (err) => {
      toast({ title: "Failed to create token", description: String(err), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (tokenId: number) => {
      await apiRequest("DELETE", `${listKey}/${tokenId}`);
    },
    onSuccess: () => {
      setConfirmRevokeId(null);
      queryClient.invalidateQueries({ queryKey: [listKey] });
      toast({ title: "Token revoked" });
    },
    onError: (err) => {
      toast({ title: "Failed to revoke token", description: String(err), variant: "destructive" });
    },
  });

  if (isLoading || isError) return null;
  const tokens = data?.data ?? [];

  async function copyToken(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Token copied" });
    } catch {
      toast({ title: "Copy failed - select the token and copy it manually", variant: "destructive" });
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-2">API Access</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Tokens let tools such as the Reporting Suite download this client&apos;s export. A token works
        for this client only and can be revoked at any time.
      </p>

      {newToken && (
        <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-2" role="status">
          <p className="text-sm font-medium">
            Token created: {newToken.name}. Copy it now - it will not be shown again.
          </p>
          <code className="block break-all rounded bg-background border px-2 py-1.5 text-xs">
            {newToken.token}
          </code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copyToken(newToken.token)}>
              Copy
            </Button>
            <Button size="sm" onClick={() => setNewToken(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length > 0) createMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="api-token-name">Token name</Label>
          <Input
            id="api-token-name"
            value={name}
            maxLength={80}
            placeholder="e.g., Reporting Suite"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="api-token-ttl">Lifetime</Label>
          <select
            id="api-token-ttl"
            value={ttlDays}
            onChange={(e) => setTtlDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {LIFETIME_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={name.trim().length === 0 || createMutation.isPending}>
          Create token
        </Button>
      </form>

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No API tokens for this client yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Token</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                <th className="py-2 pr-4 font-medium">Last used</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => {
                const status = tokenStatus(t);
                return (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{t.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{t.tokenPrefix}...</td>
                    <td className="py-2 pr-4">{status}</td>
                    <td className="py-2 pr-4">{formatDate(t.expiresAt)}</td>
                    <td className="py-2 pr-4">{t.lastUsedAt === null ? "Never" : formatDate(t.lastUsedAt)}</td>
                    <td className="py-2 text-right">
                      {status === "Active" &&
                        (confirmRevokeId === t.id ? (
                          <span className="inline-flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={revokeMutation.isPending}
                              onClick={() => revokeMutation.mutate(t.id)}
                            >
                              Confirm revoke
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmRevokeId(null)}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setConfirmRevokeId(t.id)}>
                            Revoke
                          </Button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
