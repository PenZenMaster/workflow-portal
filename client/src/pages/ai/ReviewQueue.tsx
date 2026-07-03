import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ResponseSentiment } from "@shared/schema";
import { Breadcrumbs, useClientName } from "@/components/Breadcrumbs";

export default function ReviewQueue() {
  const { id } = useParams<{ id: string }>();
  const clientName = useClientName(id);

  const { data, isLoading } = useQuery<{ data: ResponseSentiment[] }>({
    queryKey: [`/api/clients/${id}/sentiment/review-queue`],
    enabled: !!id,
  });

  const queue = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Breadcrumbs
        items={[
          { label: "Workflows", href: "/" },
          { label: "Clients", href: "/ai/clients" },
          { label: clientName, href: `/ai/clients/${id}` },
          { label: "Sentiment Review Queue" },
        ]}
      />

      <h1 className="text-2xl font-bold mb-6">
        Review Queue
        <span className="ml-3 text-base font-normal text-muted-foreground">
          ({queue.length} item{queue.length !== 1 ? "s" : ""})
        </span>
      </h1>

      {queue.length === 0 ? (
        <p className="text-muted-foreground">No items need review.</p>
      ) : (
        <ul className="space-y-3">
          {queue.map((s) => (
            <li key={s.id} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs bg-muted px-2 py-0.5 rounded">{s.label}</span>
                <span className="text-xs text-muted-foreground">
                  confidence: {(s.confidence * 100).toFixed(0)}%
                </span>
                {s.facetLabels.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    facets: {s.facetLabels.join(", ")}
                  </span>
                )}
              </div>
              {s.evidenceExcerpt && (
                <p className="text-sm text-muted-foreground italic line-clamp-2">
                  "{s.evidenceExcerpt}"
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
