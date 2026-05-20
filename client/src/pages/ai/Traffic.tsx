import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

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

interface MonthlyData {
  noIntegration: boolean;
  months: Array<{
    yearMonth: string;
    label: string;
    sources: Record<string, number>;
    total: number;
  }>;
  allSources: string[];
  fromDate: string;
  toDate: string;
  error?: string;
}

// Deterministic colors per AI source
const SOURCE_COLOURS: Record<string, string> = {
  "perplexity.ai": "#06b6d4",
  "chatgpt.com": "#10b981",
  "chat.openai.com": "#34d399",
  "claude.ai": "#8b5cf6",
  "anthropic.com": "#a78bfa",
  "gemini.google.com": "#3b82f6",
  "bard.google.com": "#60a5fa",
  "copilot.microsoft.com": "#f59e0b",
  "deepseek.com": "#6366f1",
  "mistral.ai": "#ef4444",
  "grok.com": "#ec4899",
  "meta.ai": "#f97316",
  "you.com": "#84cc16",
  "poe.com": "#14b8a6",
};
const FALLBACK = ["#94a3b8","#64748b","#475569","#334155","#1e293b","#0f172a","#cbd5e1","#e2e8f0"];
function colour(src: string, i: number) { return SOURCE_COLOURS[src] ?? FALLBACK[i % FALLBACK.length]; }

function KpiCard({ label, value, format = String }: { label: string; value: number; format?: (v: number) => string }) {
  return (
    <div className="border rounded-lg p-5">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold">{format(value)}</p>
    </div>
  );
}

type Period = "3m" | "6m" | "12m";

export default function Traffic() {
  const { id } = useParams<{ id: string }>();
  const [period, setPeriod] = useState<Period>("6m");

  const { data: kpiResult, isLoading: kpiLoading } = useQuery<{ data: TrafficData }>({
    queryKey: [`/api/clients/${id}/traffic?period=30d`],
    enabled: !!id,
  });

  const { data: monthlyResult, isLoading: monthlyLoading } = useQuery<{ data: MonthlyData }>({
    queryKey: [`/api/clients/${id}/traffic/monthly?period=${period}`],
    enabled: !!id,
  });

  const traffic = kpiResult?.data;
  const monthly = monthlyResult?.data;

  if (kpiLoading || monthlyLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  if (!traffic || traffic.noIntegration) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">Back to Client</Link>
        </div>
        <h1 className="text-2xl font-bold mb-6">AI Traffic Impact</h1>
        <div className="border rounded-lg p-6 text-center">
          <p className="font-medium mb-2">No GA4 Integration Configured</p>
          <p className="text-sm text-muted-foreground mb-4">Connect a Google Analytics 4 property to track AI-sourced traffic.</p>
          <Link href={`/ai/clients/${id}/settings/integrations`} className="text-sm text-primary hover:underline">Set up integration</Link>
        </div>
      </div>
    );
  }

  const chartData = (monthly?.months ?? []).map((m) => ({ name: m.label, ...m.sources }));
  const allSources = monthly?.allSources ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">Back to Client</Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">AI Traffic Impact</h1>

      {traffic.error && <p className="text-sm text-red-600 mb-4">GA4 error: {traffic.error}</p>}

      {/* KPI cards — last 30 days */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="AI Sessions (30d)" value={traffic.sessions} />
        <KpiCard label="Engagement Rate" value={traffic.engagementRate} format={(v) => `${(v * 100).toFixed(1)}%`} />
        <KpiCard label="Pages / Session" value={traffic.pagesPerSession} format={(v) => v.toFixed(2)} />
        <KpiCard label="Conversion Rate" value={traffic.conversionRate} format={(v) => `${(v * 100).toFixed(2)}%`} />
      </div>

      {/* Monthly stacked bar chart */}
      <div className="border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Sessions by AI Source — Monthly</h2>
          <div className="flex gap-1">
            {(["3m","6m","12m"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {monthly?.error && <p className="text-sm text-red-600 mb-3">{monthly.error}</p>}

        {chartData.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No AI traffic data for this period yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {allSources.map((src, i) => (
                <Bar key={src} dataKey={src} stackId="a" fill={colour(src, i)} name={src} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
