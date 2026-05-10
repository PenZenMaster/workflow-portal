import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Prompt, PromptCollection } from "@shared/schema";

export default function PromptCollectionDetail() {
  const { id, collectionId } = useParams<{ id: string; collectionId: string }>();

  const { data: collectionData, isLoading: colLoading } = useQuery<{
    data: PromptCollection;
  }>({
    queryKey: [`/api/prompt-collections/${collectionId}`],
    enabled: !!collectionId,
  });

  const { data: promptsData, isLoading: promptsLoading } = useQuery<{
    data: Prompt[];
  }>({
    queryKey: [`/api/prompt-collections/${collectionId}/prompts`],
    enabled: !!collectionId,
  });

  if (colLoading || promptsLoading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  const collection = collectionData?.data;
  const prompts = promptsData?.data ?? [];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/ai/clients/${id}/prompts`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to Collections
        </Link>
      </div>

      {collection && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{collection.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted-foreground">v{collection.version}</span>
            <span className="text-xs bg-muted px-2 py-0.5 rounded">{collection.status}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          Prompts <span className="text-muted-foreground font-normal text-sm">({prompts.length})</span>
        </h2>
      </div>

      {prompts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No prompts in this collection.</p>
      ) : (
        <ul className="space-y-2">
          {prompts.map((p) => (
            <li key={p.id} className="border rounded p-3">
              <p className="text-sm">{p.text}</p>
              <div className="flex gap-2 mt-1.5">
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.category}</span>
                <span className="text-xs text-muted-foreground">{p.funnelStage}</span>
                {p.geo && <span className="text-xs text-muted-foreground">{p.geo}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
