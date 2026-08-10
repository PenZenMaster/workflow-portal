import { useQuery } from "@tanstack/react-query";

interface RunHealthSummary {
  runId: number;
  status: "healthy" | "healthy_with_warnings" | "degraded" | "invalid_for_reporting";
  reasons: string[];
}

interface MeasurementHealthRollup {
  totalRuns: number;
  healthy: number;
  healthyWithWarnings: number;
  degraded: number;
  invalidForReporting: number;
}

interface MeasurementHealthPeriod {
  period: string;
  runs: RunHealthSummary[];
  rollup: MeasurementHealthRollup;
}

const STATUS_LABEL: Record<RunHealthSummary["status"], string> = {
  healthy: "Healthy",
  healthy_with_warnings: "Healthy (warnings)",
  degraded: "Degraded",
  invalid_for_reporting: "Invalid for reporting",
};

// issue #30 slice 5: period-level rollup - "N of M runs healthy" so
// analysts and clients can tell at a glance whether the numbers on the
// rest of this page can be trusted, without opening every run.
export function MeasurementHealthSection({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = useQuery<{ data: MeasurementHealthPeriod }>({
    queryKey: [`/api/clients/${clientId}/measurement-health`],
    retry: false,
  });

  if (isLoading || isError) return null;
  const health = data?.data;
  if (!health || health.rollup.totalRuns === 0) return null;

  const { rollup } = health;
  const trustworthy = rollup.healthy + rollup.healthyWithWarnings;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Measurement Health</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Last {health.period}: {trustworthy} of {rollup.totalRuns} run
        {rollup.totalRuns === 1 ? "" : "s"} healthy
        {rollup.degraded > 0 && `, ${rollup.degraded} degraded`}
        {rollup.invalidForReporting > 0 && `, ${rollup.invalidForReporting} invalid for reporting`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-4 font-medium">Run</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {health.runs.map((run) => (
              <tr key={run.runId} className="border-b last:border-0">
                <td className="py-2 pr-4">#{run.runId}</td>
                <td className="py-2">{STATUS_LABEL[run.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
