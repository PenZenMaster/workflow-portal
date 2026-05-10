import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Integration } from "@shared/schema";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failing: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  disabled: "bg-muted text-muted-foreground",
};

export default function Integrations() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: Integration[] }>({
    queryKey: [`/api/clients/${id}/integrations`],
    enabled: !!id,
  });

  const list = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Integrations</h1>

      {list.length === 0 ? (
        <div className="border rounded-lg p-6">
          <p className="font-medium mb-1">No integrations configured</p>
          <p className="text-sm text-muted-foreground">
            Add a GA4 integration to enable AI traffic tracking for this client.
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Set <code className="bg-muted px-1 rounded">GA4_SERVICE_ACCOUNT_KEY_PATH</code> in your .env,
            then create an integration below with the GA4 property ID.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((i) => (
            <li key={i.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium uppercase text-sm mr-2">{i.kind}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[i.status]}`}>
                    {i.status}
                  </span>
                </div>
                {i.lastSyncedAt && (
                  <span className="text-xs text-muted-foreground">
                    Last synced: {new Date(i.lastSyncedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {i.kind === "ga4" && (i.config as { propertyId?: string }).propertyId && (
                <p className="text-sm text-muted-foreground mt-1">
                  Property: {(i.config as { propertyId: string }).propertyId}
                </p>
              )}
              {i.lastError && (
                <p className="text-xs text-red-600 mt-1">{i.lastError}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
