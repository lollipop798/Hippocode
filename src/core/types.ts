export const HIPPO_COMMANDS = [
  "/hippo:recall",
  "/hippo:forecast",
  "/hippo:reflect",
  "/hippo:sleep",
  "/hippo:associate",
  "/hippo:active-recall",
  "/hippo:deep-sleep",
  "/hippo:project-onboard",
  "/hippo:prune",
  "/hippo:status"
] as const;

export type HippoCommandName = (typeof HIPPO_COMMANDS)[number];

export const MEMORY_LAYERS = [
  "project",
  "decision",
  "incident",
  "pattern",
  "module",
  "episodic",
  "archive"
] as const;

export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

export const EXPOSURE_LEVELS = ["summary", "focused", "full"] as const;

export type ExposureLevel = (typeof EXPOSURE_LEVELS)[number];

export type CommandStatus = "ok" | "partial" | "error";

export interface EntityMention {
  id: string;
  label: string;
  entityType: MemoryLayer | "constraint" | "tag" | "task";
  confidence: number;
  sourceText?: string;
}

export interface MemoryReference {
  id: string;
  layer: MemoryLayer;
  path: string;
  title: string;
  summary: string;
  keywords: string[];
  confidence?: number;
  lastValidated?: string;
}

export interface MemoryEntry {
  id: string;
  layer: MemoryLayer;
  title: string;
  summary: string;
  keywords: string[];
  scope: string;
  exposure: ExposureLevel;
  tags?: string[];
  references?: string[];
  createdAt: string;
  updatedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryGraphNode {
  id: string;
  type: MemoryLayer | "constraint" | "task";
  title: string;
  summary: string;
  keywords: string[];
  layer: MemoryLayer;
  weight: number;
  confidence?: number;
  lastValidated?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryGraphEdge {
  from: string;
  to: string;
  type:
    | "related_to"
    | "depends_on"
    | "caused_by"
    | "mitigated_by"
    | "implements"
    | "observed_in";
  weight: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryGraphSnapshot {
  version: string;
  updatedAt: string;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
}

export interface ExposurePolicy {
  defaultLevel: ExposureLevel;
  maxLevel: ExposureLevel;
  escalationTriggers: string[];
  summarizeBeforeExpand: boolean;
}

export interface SummaryCompressionRule {
  maxItems: number;
  maxCharacters: number;
  includeKeywords: boolean;
  includeReferences: boolean;
  preserveIncidents: boolean;
}

export interface RecallPipelineConfig {
  policy: ExposurePolicy;
  compression: SummaryCompressionRule;
  expansionHeuristics: string[];
  rankingSignals: Array<"nodeWeight" | "edgeWeight" | "confidence" | "recency">;
}

export interface RecallMatch {
  entry: MemoryReference;
  score: number;
  reasons: string[];
  linkedNodeIds: string[];
}

export interface RecallTelemetry {
  confidence: number;
  exposureLevel: ExposureLevel;
  exposureTrace: ExposureLevel[];
  dependencies: string[];
  nextCommandHint?: HippoCommandName;
}

export interface RecallResult {
  command: "/hippo:recall" | "/hippo:associate" | "/hippo:active-recall";
  intent: string;
  entities: EntityMention[];
  matches: RecallMatch[];
  risks: string[];
  suggestedFocusPaths: string[];
}

export interface ForecastStep {
  title: string;
  rationale: string;
  validation: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface ForecastPlan {
  command: "/hippo:forecast";
  goal: string;
  assumptions: string[];
  constraints: string[];
  steps: ForecastStep[];
  followUpCommands: HippoCommandName[];
}

export interface ReflectInsight {
  command: "/hippo:reflect";
  summary: string;
  deviations: string[];
  confirmedSignals: string[];
  misleadingSignals: string[];
  reusableLessons: string[];
}

export interface SleepEntry {
  command: "/hippo:sleep" | "/hippo:deep-sleep";
  summary: string;
  touchedFiles: string[];
  validation: string[];
  candidateLayers: MemoryLayer[];
  promoteToLongTerm: boolean;
}

export interface CommandPayload<TStructured> {
  humanReadable: string;
  structured: TStructured;
}

export interface CommandTelemetry {
  confidence: number;
  exposureLevel: ExposureLevel;
  dependencies: string[];
  exposureTrace: ExposureLevel[];
  nextCommandHint?: HippoCommandName;
}

export interface CommandEnvelope<TStructured> {
  status: CommandStatus;
  payload: CommandPayload<TStructured>;
  telemetry: CommandTelemetry;
}
