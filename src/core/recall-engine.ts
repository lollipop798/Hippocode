import { clampScore, slugify, summarizeText, tokenizeText, uniqueStrings } from "../utils/text.js";
import type {
  CommandEnvelope,
  EntityMention,
  ExposureLevel,
  MemoryEntry,
  MemoryGraphNode,
  MemoryGraphSnapshot,
  MemoryReference,
  RecallCommandInput,
  RecallMatch,
  RecallPipelineConfig,
  RecallResult
} from "./types.js";

export interface RecallSource {
  entries: MemoryEntry[];
  graph: MemoryGraphSnapshot;
}

export function createDefaultRecallPipelineConfig(): RecallPipelineConfig {
  return {
    policy: {
      defaultLevel: "summary",
      maxLevel: "full",
      escalationTriggers: ["focusPath", "explicitExposure"],
      summarizeBeforeExpand: true
    },
    compression: {
      maxItems: 5,
      maxCharacters: 280,
      includeKeywords: true,
      includeReferences: true,
      preserveIncidents: true
    },
    expansionHeuristics: [
      "prefer-project-context",
      "incident-before-module",
      "follow-direct-graph-neighbors"
    ],
    rankingSignals: ["nodeWeight", "edgeWeight", "confidence", "recency"]
  };
}

export function buildRecallCommand(
  input: RecallCommandInput,
  source: RecallSource,
  config: RecallPipelineConfig = createDefaultRecallPipelineConfig()
): CommandEnvelope<RecallResult> {
  const { level, trace } = resolveExposure(input, config);
  const tokens = uniqueStrings(
    [
      ...tokenizeText(input.prompt),
      ...tokenizeText(input.intent ?? ""),
      ...tokenizeText(input.focusPath ?? ""),
      ...(input.filters ?? []).flatMap((filter) => tokenizeText(filter))
    ].filter((token) => token.length > 1)
  );
  const entities = buildEntities(tokens);
  const matches = rankEntries(source.entries, source.graph, tokens, input, config).slice(
    0,
    input.limit ?? config.compression.maxItems
  );
  const intent = input.intent?.trim() || slugify(input.prompt, "general-task");
  const risks = collectRisks(matches, config);
  const suggestedFocusPaths = collectFocusPaths(matches);
  const confidence = clampScore(
    matches.length === 0
      ? 0.2
      : matches.slice(0, 3).reduce((sum, match) => sum + match.score, 0) /
          Math.min(matches.length, 3)
  );
  const status =
    matches.length === 0 ? "partial" : confidence >= 0.35 ? "ok" : "partial";

  const structured: RecallResult = {
    command: "/hippo:recall",
    intent,
    ...(input.focusPath ? { focusPath: input.focusPath } : {}),
    entities,
    matches,
    risks,
    suggestedFocusPaths
  };

  return {
    status,
    payload: {
      humanReadable: buildHumanReadableSummary(structured, confidence, config),
      structured
    },
    telemetry: {
      confidence,
      exposureLevel: level,
      dependencies: matches.map((match) => match.entry.id),
      exposureTrace: trace,
      nextCommandHint:
        matches.length === 0 ? "/hippo:project-onboard" : "/hippo:forecast"
    }
  };
}

function resolveExposure(
  input: RecallCommandInput,
  config: RecallPipelineConfig
): { level: ExposureLevel; trace: ExposureLevel[] } {
  const explicitLevel = input.exposureLevel;
  const shouldEscalate =
    Boolean(input.focusPath) || (explicitLevel !== undefined && explicitLevel !== "summary");

  if (!shouldEscalate) {
    return {
      level: config.policy.defaultLevel,
      trace: [config.policy.defaultLevel]
    };
  }

  const requestedLevel = explicitLevel ?? "focused";
  const level = requestedLevel === "full" && config.policy.maxLevel !== "full"
    ? config.policy.maxLevel
    : requestedLevel;

  return {
    level,
    trace: level === "summary" ? ["summary"] : ["summary", level]
  };
}

function buildEntities(tokens: string[]): EntityMention[] {
  return tokens.slice(0, 8).map((token) => ({
    id: token,
    label: token,
    entityType: token.includes("/") ? "task" : "tag",
    confidence: token.includes("/") ? 0.82 : 0.68,
    sourceText: token
  }));
}

function rankEntries(
  entries: MemoryEntry[],
  graph: MemoryGraphSnapshot,
  queryTokens: string[],
  input: RecallCommandInput,
  config: RecallPipelineConfig
): RecallMatch[] {
  const graphById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgesByNode = buildEdgesByNode(graph);
  const fallbackProjectEntries = entries.filter((entry) => entry.layer === "project").slice(0, 2);
  const candidates = entries.map((entry) =>
    scoreEntry(entry, queryTokens, input.focusPath, graphById, edgesByNode, config)
  );
  const activeCandidates =
    queryTokens.length === 0
      ? candidates.filter((candidate) => candidate.entry.layer === "project")
      : candidates.filter((candidate) => candidate.score >= 0.12);

  if (activeCandidates.length === 0 && fallbackProjectEntries.length > 0) {
    return fallbackProjectEntries.map((entry) => ({
      entry: toReference(entry),
      score: 0.25,
      reasons: ["project baseline"],
      linkedNodeIds: []
    }));
  }

  return activeCandidates.sort((left, right) => right.score - left.score);
}

function scoreEntry(
  entry: MemoryEntry,
  queryTokens: string[],
  focusPath: string | undefined,
  graphById: Map<string, MemoryGraphNode>,
  edgesByNode: Map<string, Array<{ id: string; weight: number }>>,
  config: RecallPipelineConfig
): RecallMatch {
  const haystackText = [
    entry.title,
    entry.summary,
    entry.scope,
    entry.sourcePath ?? "",
    ...(entry.keywords ?? []),
    ...(entry.tags ?? []),
    ...(entry.references ?? [])
  ]
    .join(" ")
    .toLowerCase();
  const matchedTokens = queryTokens.filter((token) => haystackText.includes(token));
  const tokenCoverage =
    queryTokens.length === 0 ? 0 : matchedTokens.length / Math.max(queryTokens.length, 1);

  let score = tokenCoverage * 0.55;
  const reasons: string[] = [];

  if (matchedTokens.length > 0) {
    reasons.push(`keyword:${matchedTokens.slice(0, 3).join(",")}`);
  }

  if (focusPath && haystackText.includes(focusPath.toLowerCase())) {
    score += 0.2;
    reasons.push("focus path");
  }

  const node = pickLinkedNode(entry, graphById);
  const linkedNodeIds: string[] = [];

  if (node) {
    linkedNodeIds.push(node.id);

    if (config.rankingSignals.includes("nodeWeight")) {
      score += clampScore(node.weight) * 0.15;
      reasons.push("graph node weight");
    }

    if (config.rankingSignals.includes("confidence")) {
      score += clampScore(node.confidence ?? entry.confidence ?? 0.6) * 0.1;
      reasons.push("graph confidence");
    }

    if (config.rankingSignals.includes("edgeWeight")) {
      const neighbors = edgesByNode.get(node.id) ?? [];
      const neighborScore = neighbors
        .slice(0, 4)
        .reduce((sum, neighbor) => sum + neighbor.weight * 0.05, 0);
      score += neighborScore;
      linkedNodeIds.push(...neighbors.slice(0, 2).map((neighbor) => neighbor.id));

      if (neighbors.length > 0) {
        reasons.push("graph neighbors");
      }
    }
  }

  if (config.compression.preserveIncidents && entry.layer === "incident") {
    score += 0.08;
    reasons.push("incident priority");
  }

  if (config.rankingSignals.includes("recency")) {
    score += recencyScore(entry.updatedAt ?? entry.createdAt) * 0.12;
    reasons.push("recently updated");
  }

  return {
    entry: toReference(entry),
    score: clampScore(score),
    reasons: uniqueStrings(reasons),
    linkedNodeIds: uniqueStrings(linkedNodeIds)
  };
}

function pickLinkedNode(
  entry: MemoryEntry,
  graphById: Map<string, MemoryGraphNode>
): MemoryGraphNode | undefined {
  const direct = graphById.get(entry.id);

  if (direct) {
    return direct;
  }

  return [...graphById.values()].find((node) =>
    node.keywords.some((keyword) => entry.keywords.includes(keyword))
  );
}

function buildEdgesByNode(
  graph: MemoryGraphSnapshot
): Map<string, Array<{ id: string; weight: number }>> {
  const result = new Map<string, Array<{ id: string; weight: number }>>();

  for (const edge of graph.edges) {
    const fromItems = result.get(edge.from) ?? [];
    fromItems.push({ id: edge.to, weight: edge.weight });
    result.set(edge.from, fromItems);

    const toItems = result.get(edge.to) ?? [];
    toItems.push({ id: edge.from, weight: edge.weight });
    result.set(edge.to, toItems);
  }

  return result;
}

function toReference(entry: MemoryEntry): MemoryReference {
  return {
    id: entry.id,
    layer: entry.layer,
    path: entry.sourcePath ?? entry.id,
    title: entry.title,
    summary: entry.summary,
    keywords: entry.keywords,
    ...(typeof entry.confidence === "number" ? { confidence: entry.confidence } : {}),
    ...(entry.updatedAt ? { lastValidated: entry.updatedAt } : {})
  };
}

function collectRisks(matches: RecallMatch[], config: RecallPipelineConfig): string[] {
  const incidentSummaries = matches
    .filter((match) => match.entry.layer === "incident")
    .map((match) => match.entry.summary);
  const keywordDrivenRisks = matches
    .filter((match) =>
      match.entry.keywords.some((keyword) => ["risk", "constraint", "incident"].includes(keyword))
    )
    .map((match) => match.entry.title);

  const risks = uniqueStrings([...incidentSummaries, ...keywordDrivenRisks]).slice(
    0,
    config.compression.maxItems
  );

  return risks;
}

function collectFocusPaths(matches: RecallMatch[]): string[] {
  return uniqueStrings(
    matches.flatMap((match) => [match.entry.path, ...(match.entry.keywords.slice(0, 2) ?? [])])
  ).slice(0, 6);
}

function buildHumanReadableSummary(
  result: RecallResult,
  confidence: number,
  config: RecallPipelineConfig
): string {
  if (result.matches.length === 0) {
    return "未召回到足够强的项目记忆，建议先补充 focus path，或先执行 /hippo:project-onboard 建立更清晰的项目画像。";
  }

  const topMatches = result.matches
    .slice(0, config.compression.maxItems)
    .map((match) => match.entry.title);
  const topRisks = result.risks.slice(0, 2);
  const focus = result.suggestedFocusPaths[0];
  const riskSummary =
    topRisks.length > 0 ? ` 需要优先注意：${topRisks.join("；")}。` : "";
  const focusSummary = focus ? ` 建议先沿 ${focus} 继续深入。` : "";

  return summarizeText(
    `召回到 ${result.matches.length} 条高相关项目记忆，置信度 ${Math.round(
      confidence * 100
    )}% 。当前最值得先看的内容是 ${topMatches.join("、")}。${riskSummary}${focusSummary}`,
    config.compression.maxCharacters
  );
}

function recencyScore(dateLike: string): number {
  const timestamp = Date.parse(dateLike);

  if (Number.isNaN(timestamp)) {
    return 0.2;
  }

  const ageInDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 7) {
    return 1;
  }

  if (ageInDays <= 30) {
    return 0.7;
  }

  if (ageInDays <= 90) {
    return 0.45;
  }

  return 0.2;
}
