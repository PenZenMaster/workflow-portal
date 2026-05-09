import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Client } from "@shared/schema";

export default function ClientsList() {
  const { data, isLoading, isError } = useQuery<{ data: Client[] }>({
    queryKey: ["/api/clients"],
  });

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading clients...</div>;
  }

  if (isError) {
    return (
      <div className="p-8 text-destructive">Failed to load clients.</div>
    );
  }

  const clients = data?.data ?? [];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Workflows
        </Link>
      </div>

      {clients.length === 0 ? (
        <p className="text-muted-foreground">
          No clients yet. Create one to start tracking AI visibility.
        </p>
      ) : (
        <ul className="space-y-3">
          {clients.map((c) => (
            <li
              key={c.id}
              className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
            >
              <Link href={`/ai/clients/${c.id}`}>
                <span className="font-medium text-primary hover:underline">
                  {c.name}
                </span>
              </Link>
              <span className="text-muted-foreground text-sm ml-3">
                {c.primaryDomain}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
