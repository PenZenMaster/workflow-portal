import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ReportExport } from "@shared/schema";

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function Reports() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: ReportExport[] }>({
    queryKey: [`/api/clients/${id}/exports`],
    enabled: !!id,
  });

  const exports = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Reports &amp; Exports</h1>

      {exports.length === 0 ? (
        <p className="text-muted-foreground">No exports yet.</p>
      ) : (
        <ul className="space-y-3">
          {exports.map((e) => (
            <li key={e.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className={`text-xs px-2 py-0.5 rounded mr-2 ${STATUS_STYLE[e.status]}`}>
                  {e.status}
                </span>
                <span className="text-sm font-medium">{e.kind}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {e.periodStart} — {e.periodEnd}
                </span>
              </div>
              {e.status === "ready" && (
                <a
                  href={`/api/exports/${e.id}/download`}
                  className="text-sm text-primary hover:underline"
                  download
                >
                  Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
