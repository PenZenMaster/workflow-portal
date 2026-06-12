import { useQuery } from "@tanstack/react-query";

interface SoVData {
  aiSoV: number;
  clientMentions: number;
  allBrandMentions: number;
  fromDate: string;
  toDate: string;
}

export function SoVSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery<{ data: SoVData }>({
    queryKey: [`/api/clients/${clientId}/metrics/sov`],
  });

  const sov = data?.data;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Share of Voice</h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : sov ? (
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <p className="text-sm text-muted-foreground mb-1">Client AI SoV</p>
            <p className="text-5xl font-bold">{sov.aiSoV.toFixed(1)}<span className="text-xl text-muted-foreground font-normal">%</span></p>
            <p className="text-sm text-muted-foreground mt-2">
              {sov.clientMentions} client mentions out of {sov.allBrandMentions} total brand mentions
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Period: {sov.fromDate} to {sov.toDate}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">No data yet.</p>
      )}
    </section>
  );
}
