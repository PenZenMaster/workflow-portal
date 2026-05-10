import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface SentimentSummary {
  positive: number;
  neutral: number;
  negative: number;
  mixed: number;
}

const LABEL_STYLE: Record<string, string> = {
  positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  neutral: "bg-muted text-muted-foreground",
  negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  mixed: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

export default function Sentiment() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: SentimentSummary }>({
    queryKey: [`/api/clients/${id}/sentiment/summary`],
    enabled: !!id,
  });

  const summary = data?.data;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sentiment</h1>
        <Link
          href={`/ai/clients/${id}/sentiment/review`}
          className="text-sm text-primary hover:underline"
        >
          Review Queue
        </Link>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["positive", "neutral", "negative", "mixed"] as const).map((label) => (
            <div key={label} className="border rounded-lg p-4">
              <span className={`text-xs px-2 py-0.5 rounded ${LABEL_STYLE[label]}`}>{label}</span>
              <p className="text-3xl font-bold mt-3">{summary[label] ?? 0}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No sentiment data yet.</p>
      )}
    </div>
  );
}
