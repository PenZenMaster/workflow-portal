import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { PromptCollection } from "@shared/schema";

export default function PromptCollections() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: PromptCollection[] }>({
    queryKey: [`/api/clients/${id}/prompt-collections`],
    enabled: !!id,
  });

  const collections = data?.data ?? [];

  const statusBadge = (status: PromptCollection["status"]) => {
    const colours: Record<string, string> = {
      active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      draft: "bg-muted text-muted-foreground",
      archived: "bg-muted/50 text-muted-foreground/60",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${colours[status] ?? ""}`}>
        {status}
      </span>
    );
  };

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/ai/clients/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Prompt Collections</h1>

      {collections.length === 0 ? (
        <p className="text-muted-foreground">No prompt collections yet.</p>
      ) : (
        <ul className="space-y-3">
          {collections.map((c) => (
            <li key={c.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
              <Link href={`/ai/clients/${id}/prompts/${c.id}`}>
                <span className="font-medium hover:underline text-primary">{c.name}</span>
              </Link>
              <span className="ml-3">{statusBadge(c.status)}</span>
              <span className="ml-3 text-xs text-muted-foreground">v{c.version}</span>
              {c.notes && (
                <p className="text-sm text-muted-foreground mt-1">{c.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
