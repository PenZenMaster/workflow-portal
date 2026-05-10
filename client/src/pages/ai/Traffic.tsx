import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface TrafficData {
  noIntegration: boolean;
  sessions: number;
  engagementRate: number;
  pagesPerSession: number;
  conversionRate: number;
  referrers: Array<{ sessionSource: string; sessions: number }>;
  fromDate: string;
  toDate: string;
  error?: string;
}

function KpiCard({ label, value, format = (v: number) => v.toString() }: {
  label: string; value: number; format?: (v: number) => string;
}) {
  return (
    <div className="border rounded-lg p-5">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold">{format(value)}</p>
    </div>
  );
}

export default function Traffic() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: TrafficData }>({
    queryKey: [`/api/clients/${id}/traffic?period=30d`],
    enabled: !!id,
  });

  const traffic = data?.data;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">AI Traffic Impact</h1>

      {!traffic || traffic.noIntegration ? (
        <div className="border rounded-lg p-6 text-center">
          <p className="font-medium mb-2">No GA4 Integration Configured</p>
          <p className="text-sm text-muted-foreground mb-4">
            Connect a Google Analytics 4 property to track AI-sourced traffic.
          </p>
          <Link
            href={`/ai/clients/${id}/settings/integrations`}
            className="text-sm text-primary hover:underline"
          >
            Set up integration
          </Link>
        </div>
      ) : (
        <>
          {traffic.error && (
            <p className="text-sm text-red-600 mb-4">GA4 error: {traffic.error}</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KpiCard label="AI Sessions" value={traffic.sessions} />
            <KpiCard label="Engagement Rate" value={traffic.engagementRate} format={(v) => `${(v * 100).toFixed(1)}%`} />
            <KpiCard label="Pages / Session" value={traffic.pagesPerSession} format={(v) => v.toFixed(2)} />
            <KpiCard label="Conversion Rate" value={traffic.conversionRate} format={(v) => `${(v * 100).toFixed(2)}%`} />
          </div>

          {traffic.referrers.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mb-3">AI Referrers</h2>
              <ul className="space-y-2">
                {traffic.referrers.map((r) => (
                  <li key={r.sessionSource} className="border rounded p-3 flex justify-between">
                    <span className="text-sm font-medium">{r.sessionSource}</span>
                    <span className="text-sm text-muted-foreground">{r.sessions} session{r.sessions !== 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Period: {traffic.fromDate} — {traffic.toDate}
          </p>
        </>
      )}
    </div>
  );
}
