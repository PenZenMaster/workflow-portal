import { Link } from "wouter";
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

export function SentimentSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery<{ data: SentimentSummary }>({
    queryKey: [`/api/clients/${clientId}/sentiment/summary`],
  });

  const summary = data?.data;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Sentiment</h2>
        <Link
          href={`/ai/clients/${clientId}/sentiment/review`}
          className="text-sm text-primary hover:underline"
        >
          Review Queue
        </Link>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : summary ? (
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
    </section>
  );
}
