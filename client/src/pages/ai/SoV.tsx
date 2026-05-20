import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface SoVData {
  aiSoV: number;
  clientMentions: number;
  allBrandMentions: number;
  fromDate: string;
  toDate: string;
}

export default function SoV() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: SoVData }>({
    queryKey: [`/api/clients/${id}/metrics/sov`],
    enabled: !!id,
  });

  const sov = data?.data;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">AI Share of Voice</h1>

      {sov ? (
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
    </div>
  );
}
