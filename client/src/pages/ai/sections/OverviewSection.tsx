import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { scrollToSection } from "@/lib/scrollToSection";

interface OverviewData {
  citationFrequency: number;
  mentionRate: number;
  aiSoV: number;
  avgVisibilityScore: number;
  totalResponses: number;
  period: string;
}

interface TrendPoint {
  date: string;
  value: number;
}

function KpiCard({ label, value, unit = "%" }: { label: string; value: number; unit?: string }) {
  return (
    <div className="border rounded-lg p-5">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold">
        {value.toFixed(1)}<span className="text-base font-normal text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}

// B-30: matches this API's existing period convention (server/routes/
// metrics.ts's periodToDates) rather than TrafficSection's "3m/6m/12m" -
// this chart is a daily trend line, not discrete month buckets, so the
// day-count convention already used everywhere else in this app fits it
// better than copying Traffic's month-bucket-specific labels.
type Period = "30d" | "90d" | "365d";
const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  "365d": "Last 12 Months",
};

export function OverviewSection({ clientId }: { clientId: string }) {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: overviewData } = useQuery<{ data: OverviewData }>({
    queryKey: [`/api/clients/${clientId}/metrics/overview?period=${period}`],
  });

  const { data: trendData } = useQuery<{ data: TrendPoint[] }>({
    queryKey: [`/api/clients/${clientId}/metrics/trend?metric=mentionRate&period=${period}`],
  });

  const overview = overviewData?.data;
  const trend = trendData?.data ?? [];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Overview</h2>
        <div className="flex gap-1">
          {(["30d", "90d", "365d"] as Period[]).map((p) => (
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

      {overview ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Citation Frequency" value={overview.citationFrequency} />
            <KpiCard label="Mention Rate" value={overview.mentionRate} />
            <KpiCard label="AI Share of Voice" value={overview.aiSoV} />
            <KpiCard label="Avg Visibility Score" value={overview.avgVisibilityScore} unit=" pts" />
          </div>

          {trend.length > 0 && (
            <div className="border rounded-lg p-5">
              <h3 className="text-sm font-medium mb-4 text-muted-foreground">
                Mention Rate — {PERIOD_LABELS[period]}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">
              Based on {overview.totalResponses} responses in the {PERIOD_LABELS[period].toLowerCase()}.
            </p>
            <button
              type="button"
              onClick={() => scrollToSection("platform-breakdown-section")}
              className="text-xs text-primary hover:underline"
            >
              View platform breakdown &rarr;
            </button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">No data yet. Run a prompt collection to start tracking.</p>
      )}
    </section>
  );
}
