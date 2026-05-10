import { useParams, Link } from "wouter";
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

export default function Overview() {
  const { id } = useParams<{ id: string }>();

  const { data: overviewData } = useQuery<{ data: OverviewData }>({
    queryKey: [`/api/clients/${id}/metrics/overview?period=30d`],
    enabled: !!id,
  });

  const { data: trendData } = useQuery<{ data: TrendPoint[] }>({
    queryKey: [`/api/clients/${id}/metrics/trend?metric=mentionRate&period=30d`],
    enabled: !!id,
  });

  const overview = overviewData?.data;
  const trend = trendData?.data ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">AI Visibility Overview</h1>

      {overview ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Citation Frequency" value={overview.citationFrequency} />
            <KpiCard label="Mention Rate" value={overview.mentionRate} />
            <KpiCard label="AI Share of Voice" value={overview.aiSoV} />
            <KpiCard label="Avg Visibility Score" value={overview.avgVisibilityScore} unit=" pts" />
          </div>

          {trend.length > 0 && (
            <div className="border rounded-lg p-5">
              <h2 className="text-sm font-medium mb-4 text-muted-foreground">
                Mention Rate — Last 30 Days
              </h2>
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

          <p className="text-xs text-muted-foreground mt-4">
            Based on {overview.totalResponses} responses in the last 30 days.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">No data yet. Run a prompt collection to start tracking.</p>
      )}
    </div>
  );
}
