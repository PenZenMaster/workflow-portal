import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface DomainCount {
  rootDomain: string;
  count: number;
  isOwnedByClient: boolean;
}

interface SourceAnalysis {
  domainCounts: DomainCount[];
  ownedCount: number;
  thirdPartyCount: number;
  ownedPercent: number;
  topDomains: DomainCount[];
}

export default function Sources() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: SourceAnalysis }>({
    queryKey: [`/api/clients/${id}/sources`],
    enabled: !!id,
  });

  const analysis = data?.data;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Citation Sources</h1>

      {analysis ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Client-Owned</p>
              <p className="text-2xl font-bold">{analysis.ownedCount}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Third-Party</p>
              <p className="text-2xl font-bold">{analysis.thirdPartyCount}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Owned %</p>
              <p className="text-2xl font-bold">{analysis.ownedPercent.toFixed(1)}%</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold mb-3">Top Cited Domains</h2>
          {analysis.topDomains.length === 0 ? (
            <p className="text-muted-foreground text-sm">No citations yet.</p>
          ) : (
            <ul className="space-y-2">
              {analysis.topDomains.map((d) => (
                <li key={d.rootDomain} className="border rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{d.rootDomain}</span>
                    {d.isOwnedByClient && (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 rounded">
                        owned
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{d.count} citation{d.count !== 1 ? "s" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No citation data yet.</p>
      )}
    </div>
  );
}
