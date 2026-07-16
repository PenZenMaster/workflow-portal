import { useQuery } from "@tanstack/react-query";

interface PlatformUsage {
  platformId: number;
  platformSlug: string;
  responses: number;
  inputTokens: number;
  outputTokens: number;
}

interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  byPlatform: PlatformUsage[];
  period: string;
}

// Spend data is internal ops: the endpoint is analyst-and-up, so this
// section renders nothing for client_viewer sessions (403 -> isError).
export function TokenUsageSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useQuery<{ data: TokenUsage }>({
    queryKey: [`/api/clients/${clientId}/metrics/token-usage`],
    retry: false,
  });

  if (isLoading || isError) return null;
  const usage = data?.data;
  if (!usage || !Array.isArray(usage.byPlatform) || usage.byPlatform.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Token Usage</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Last {usage.period}: {usage.totalInputTokens.toLocaleString()} in /{" "}
        {usage.totalOutputTokens.toLocaleString()} out
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">Platform</th>
              <th className="py-2 pr-4 font-medium">Responses</th>
              <th className="py-2 pr-4 font-medium">Input tokens</th>
              <th className="py-2 font-medium">Output tokens</th>
            </tr>
          </thead>
          <tbody>
            {usage.byPlatform.map((p) => (
              <tr key={p.platformId} className="border-b last:border-0">
                <td className="py-2 pr-4">{p.platformSlug}</td>
                <td className="py-2 pr-4">{p.responses.toLocaleString()}</td>
                <td className="py-2 pr-4">{p.inputTokens.toLocaleString()}</td>
                <td className="py-2">{p.outputTokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
