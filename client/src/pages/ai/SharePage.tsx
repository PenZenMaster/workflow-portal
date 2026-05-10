import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface ShareData {
  kind: string;
  periodStart?: string;
  periodEnd?: string;
  status?: string;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery<{ data: ShareData }>({
    queryKey: [`/api/share/${token}/data`],
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading shared report...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-center p-8">
        <p className="text-lg font-semibold text-destructive">Link Unavailable</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          This share link may have expired, been revoked, or is invalid.
        </p>
      </div>
    );
  }

  const report = data.data;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">AI Visibility Report</h1>
        {report.periodStart && report.periodEnd && (
          <p className="text-muted-foreground mb-6">
            {report.periodStart} — {report.periodEnd}
          </p>
        )}

        <div className="border rounded-lg p-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Export type:</span>
            <span className="text-sm text-muted-foreground">{report.kind}</span>
          </div>
          {report.status && (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm font-medium">Status:</span>
              <span className="text-sm text-muted-foreground">{report.status}</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Shared via Workflow Portal AI Visibility Module.
        </p>
      </div>
    </div>
  );
}
