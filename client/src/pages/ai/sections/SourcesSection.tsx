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

export function SourcesSection({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery<{ data: SourceAnalysis }>({
    queryKey: [`/api/clients/${clientId}/sources`],
  });

  const analysis = data?.data;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Citation Sources</h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : analysis ? (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
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

          <h3 className="text-lg font-semibold mb-3">Top Cited Domains</h3>
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
    </section>
  );
}
