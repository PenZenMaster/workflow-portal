import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Client, Brand } from "@shared/schema";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: clientData, isLoading } = useQuery<{ data: Client }>({
    queryKey: [`/api/clients/${id}`],
    enabled: !!id,
  });

  const { data: brandsData } = useQuery<{ data: Brand[] }>({
    queryKey: [`/api/clients/${id}/brands`],
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  if (!clientData) {
    return <div className="p-8 text-destructive">Client not found.</div>;
  }

  const client = clientData.data;
  const brands = brandsData?.data ?? [];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/ai/clients"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Clients
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-1">{client.name}</h1>
      <p className="text-muted-foreground mb-6">{client.primaryDomain}</p>

      {client.geographies.length > 0 && (
        <div className="mb-4">
          <span className="text-sm font-medium">Geographies: </span>
          <span className="text-sm text-muted-foreground">
            {client.geographies.join(", ")}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-8">
        <Link
          href={`/ai/clients/${id}/overview`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Overview
        </Link>
        <Link
          href={`/ai/clients/${id}/prompts`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Prompt Collections
        </Link>
        <Link
          href={`/ai/clients/${id}/runs`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Runs
        </Link>
        <Link
          href={`/ai/clients/${id}/mentions`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Mentions
        </Link>
        <Link
          href={`/ai/clients/${id}/sov`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Share of Voice
        </Link>
        <Link
          href={`/ai/clients/${id}/sentiment`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Sentiment
        </Link>
        <Link
          href={`/ai/clients/${id}/reports`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Reports
        </Link>
        <Link
          href={`/ai/clients/${id}/sources`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Sources
        </Link>
        <Link
          href={`/ai/clients/${id}/recommendations`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Recommendations
        </Link>
        <Link
          href={`/ai/clients/${id}/traffic`}
          className="text-sm font-medium border rounded-lg px-4 py-2 hover:bg-muted/50 transition-colors"
        >
          Traffic
        </Link>
      </div>

      <section className="mt-2">
        <h2 className="text-lg font-semibold mb-3">Brands</h2>
        {brands.length === 0 ? (
          <p className="text-muted-foreground text-sm">No brands configured.</p>
        ) : (
          <ul className="space-y-2">
            {brands.map((b) => (
              <li
                key={b.id}
                className="border rounded p-3 flex items-center gap-3"
              >
                <span className="font-medium">{b.canonicalName}</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  {b.kind}
                </span>
                {b.primaryDomain && (
                  <span className="text-sm text-muted-foreground">
                    {b.primaryDomain}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
