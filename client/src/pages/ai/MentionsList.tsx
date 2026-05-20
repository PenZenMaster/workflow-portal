import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { ResponseMention } from "@shared/schema";

const SECTION_BADGE: Record<string, string> = {
  summary: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  list: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  body: "bg-muted text-muted-foreground",
};

export default function MentionsList() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<{ data: ResponseMention[] }>({
    queryKey: [`/api/clients/${id}/mentions`],
    enabled: !!id,
  });

  const mentions = data?.data ?? [];

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/ai/clients/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Back to Client
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Mentions</h1>

      {mentions.length === 0 ? (
        <p className="text-muted-foreground">No mentions detected yet.</p>
      ) : (
        <ul className="space-y-3">
          {mentions.map((m) => (
            <li key={m.id} className="border rounded-lg p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded ${SECTION_BADGE[m.section] ?? ""}`}>
                  {m.section}
                </span>
                <span className="font-medium text-sm">{m.matchedText}</span>
                {m.recommendationRank && (
                  <span className="text-xs text-muted-foreground">#{m.recommendationRank}</span>
                )}
              </div>
              {m.evidenceExcerpt && (
                <p className="text-sm text-muted-foreground italic">"{m.evidenceExcerpt}"</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
