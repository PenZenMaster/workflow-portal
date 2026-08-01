import { useQuery } from "@tanstack/react-query";

interface CorePlatformRow {
  platformId: number;
  slug: string;
  displayName: string;
  totalResponses: number;
  mentionRate: number;
  citationFrequency: number;
  aiSoV: number;
  avgVisibilityScore: number;
  trustedThirdPartySupportRate: number;
  clientOwnedCitationRate: number;
  competitorOwnedCitationRate: number;
}

interface CoreRollup {
  mentionRate: number;
  citationFrequency: number;
  aiSoV: number;
  avgVisibilityScore: number;
  trustedThirdPartySupportRate: number;
  clientOwnedCitationRate: number;
  competitorOwnedCitationRate: number;
}

interface CoreByPlatform {
  platforms: CorePlatformRow[];
  combined: { platformBalanced: CoreRollup; responseWeighted: CoreRollup };
}

interface RankDistribution {
  avgRank: number | null;
  medianRank: number | null;
  rank1Frequency: number;
  top3Frequency: number;
  unrankedFrequency: number;
  mentionedCount: number;
}

interface NonBrandedPlatformRow {
  platformId: number;
  slug: string;
  displayName: string;
  nonBrandedResponses: number;
  mentionRate: number;
  recommendationRate: number;
  strongRecommendationRate: number;
  firstChoiceRate: number;
  recommendationSoV: number;
  rankDistribution: RankDistribution;
}

interface NonBrandedRollup {
  mentionRate: number;
  recommendationRate: number;
  strongRecommendationRate: number;
  firstChoiceRate: number;
  recommendationSoV: number;
  rankDistribution: RankDistribution;
}

interface NonBrandedByPlatform {
  platforms: NonBrandedPlatformRow[];
  combined: { platformBalanced: NonBrandedRollup; responseWeighted: NonBrandedRollup };
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function rank(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toFixed(1);
}

function RollupCaption({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground mt-2">
      "All Platforms" shows the platform-balanced average (equal weight per
      platform); {label} is the response-weighted equivalent, available via
      the API.
    </p>
  );
}

function CoreMetricsTable({ data }: { data: CoreByPlatform }) {
  if (data.platforms.length === 0) {
    return <p className="text-muted-foreground">No platform data yet.</p>;
  }
  const { platformBalanced, responseWeighted } = data.combined;
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4 font-medium">Platform</th>
            <th className="py-2 pr-4 font-medium">Sample size</th>
            <th className="py-2 pr-4 font-medium">Mention Rate</th>
            <th className="py-2 pr-4 font-medium">Citation Frequency</th>
            <th className="py-2 pr-4 font-medium">AI SoV</th>
            <th className="py-2 pr-4 font-medium">Avg Visibility Score</th>
            <th className="py-2 pr-4 font-medium">Trusted 3rd-Party Support</th>
            <th className="py-2 pr-4 font-medium">Client-Owned Citation %</th>
            <th className="py-2 font-medium">Competitor-Owned Citation %</th>
          </tr>
        </thead>
        <tbody>
          {data.platforms.map((p) => (
            <tr key={p.platformId} className="border-b last:border-0">
              <td className="py-2 pr-4">{p.displayName}</td>
              <td className="py-2 pr-4">{p.totalResponses}</td>
              <td className="py-2 pr-4">{pct(p.mentionRate)}</td>
              <td className="py-2 pr-4">{pct(p.citationFrequency)}</td>
              <td className="py-2 pr-4">{pct(p.aiSoV)}</td>
              <td className="py-2 pr-4">{p.avgVisibilityScore.toFixed(1)}</td>
              <td className="py-2 pr-4">{pct(p.trustedThirdPartySupportRate)}</td>
              <td className="py-2 pr-4">{pct(p.clientOwnedCitationRate)}</td>
              <td className="py-2">{pct(p.competitorOwnedCitationRate)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="py-2 pr-4">All Platforms</td>
            <td className="py-2 pr-4" />
            <td className="py-2 pr-4">{pct(platformBalanced.mentionRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.citationFrequency)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.aiSoV)}</td>
            <td className="py-2 pr-4">{platformBalanced.avgVisibilityScore.toFixed(1)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.trustedThirdPartySupportRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.clientOwnedCitationRate)}</td>
            <td className="py-2">{pct(platformBalanced.competitorOwnedCitationRate)}</td>
          </tr>
        </tfoot>
      </table>
      <RollupCaption
        label={`response-weighted mention rate ${pct(responseWeighted.mentionRate)}`}
      />
    </div>
  );
}

function NonBrandedMetricsTable({ data }: { data: NonBrandedByPlatform }) {
  if (data.platforms.length === 0) {
    return <p className="text-muted-foreground">No non-branded platform data yet.</p>;
  }
  const { platformBalanced, responseWeighted } = data.combined;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-2 pr-4 font-medium">Platform</th>
            <th className="py-2 pr-4 font-medium">Sample size</th>
            <th className="py-2 pr-4 font-medium">Mention Rate</th>
            <th className="py-2 pr-4 font-medium">Recommendation Rate</th>
            <th className="py-2 pr-4 font-medium">Strong Recommendation Rate</th>
            <th className="py-2 pr-4 font-medium">First Choice Rate</th>
            <th className="py-2 pr-4 font-medium">Recommendation SoV</th>
            <th className="py-2 font-medium">Avg Rank</th>
          </tr>
        </thead>
        <tbody>
          {data.platforms.map((p) => (
            <tr key={p.platformId} className="border-b last:border-0">
              <td className="py-2 pr-4">{p.displayName}</td>
              <td className="py-2 pr-4">{p.nonBrandedResponses}</td>
              <td className="py-2 pr-4">{pct(p.mentionRate)}</td>
              <td className="py-2 pr-4">{pct(p.recommendationRate)}</td>
              <td className="py-2 pr-4">{pct(p.strongRecommendationRate)}</td>
              <td className="py-2 pr-4">{pct(p.firstChoiceRate)}</td>
              <td className="py-2 pr-4">{pct(p.recommendationSoV)}</td>
              <td className="py-2">{rank(p.rankDistribution.avgRank)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="py-2 pr-4">All Platforms</td>
            <td className="py-2 pr-4" />
            <td className="py-2 pr-4">{pct(platformBalanced.mentionRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.recommendationRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.strongRecommendationRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.firstChoiceRate)}</td>
            <td className="py-2 pr-4">{pct(platformBalanced.recommendationSoV)}</td>
            <td className="py-2">{rank(platformBalanced.rankDistribution.avgRank)}</td>
          </tr>
        </tfoot>
      </table>
      <RollupCaption
        label={`response-weighted mention rate ${pct(responseWeighted.mentionRate)}`}
      />
    </div>
  );
}

export function PlatformBreakdownSection({ clientId }: { clientId: string }) {
  const { data: coreData, isLoading: coreLoading } = useQuery<{ data: CoreByPlatform }>({
    queryKey: [`/api/clients/${clientId}/metrics/by-platform?period=30d`],
  });
  const { data: nonBrandedData, isLoading: nonBrandedLoading } = useQuery<{
    data: NonBrandedByPlatform;
  }>({
    queryKey: [`/api/clients/${clientId}/metrics/non-branded/by-platform?period=30d`],
  });

  const core = coreData?.data;
  const nonBranded = nonBrandedData?.data;
  const isLoading = coreLoading || nonBrandedLoading;

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">Platform Breakdown</h2>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : core || nonBranded ? (
        <>
          {core && <CoreMetricsTable data={core} />}
          {nonBranded && <NonBrandedMetricsTable data={nonBranded} />}
        </>
      ) : (
        <p className="text-muted-foreground">No data yet.</p>
      )}
    </section>
  );
}
