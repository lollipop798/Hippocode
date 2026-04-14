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

export const HOST_LIFECYCLE_EVENTS = [
  "sessionStart",
  "userInput",
  "preTool",
  "postTool",
  "sessionEnd"
] as const;

export type HostLifecycleEvent = (typeof HOST_LIFECYCLE_EVENTS)[number];

export type CommandStatus = "ok" | "partial" | "error";
export type RecallScope = "task" | "module" | "project";
export type RiskLevel = "low" | "medium" | "high";
export type SleepSignalStrength = "low" | "medium" | "high";

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
  sourcePath?: string;
  content?: string;
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
    | "observed_in"
    | "constrains"
    | "applies_to"
    | "describes"
    | "risks"
    | "mitigates";
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
  focusPath?: string;
  entities: EntityMention[];
  matches: RecallMatch[];
  risks: string[];
  suggestedFocusPaths: string[];
}

export interface ForecastStep {
  title: string;
  rationale: string;
  validation: string[];
  riskLevel: RiskLevel;
}

export interface ForecastPlan {
  command: "/hippo:forecast";
  goal: string;
  assumptions: string[];
  constraints: string[];
  recommendedFocusPath?: string;
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
  candidateLayers?: MemoryLayer[];
  episodicEntryId?: string;
}

export interface SleepEntry {
  command: "/hippo:sleep" | "/hippo:deep-sleep";
  summary: string;
  touchedFiles: string[];
  validation: string[];
  candidateLayers: MemoryLayer[];
  promoteToLongTerm: boolean;
  episodicEntryId?: string;
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

export interface RecallCommandInput {
  prompt: string;
  intent?: string;
  scope: RecallScope;
  focusPath?: string;
  filters?: string[];
  exposureLevel?: ExposureLevel;
  limit?: number;
}

export interface ForecastCommandInput {
  taskDescription: string;
  constraints: string[];
  recallSnapshot?: RecallResult;
  riskProfile?: RiskLevel;
  dependencies?: string[];
  targetExposure?: ExposureLevel;
}

export interface ReflectCommandInput {
  sessionEvents: string[];
  outcome: string;
  anomalies?: string[];
  lessons?: string[];
  timeRange?: string;
  priorForecast?: ForecastPlan;
}

export interface SleepCommandInput {
  summary: string;
  touchedFiles: string[];
  validation: string[];
  tags?: string[];
  exposureLevel?: ExposureLevel;
  signalStrength?: SleepSignalStrength;
}

export interface DeepSleepCommandInput {
  summary: string;
  touchedFiles: string[];
  validation: string[];
  candidateLayers: MemoryLayer[];
  sourceEpisodicId?: string;
  tags?: string[];
  exposureLevel?: ExposureLevel;
  signalStrength?: SleepSignalStrength;
}

export interface DeepSleepResult {
  command: "/hippo:deep-sleep";
  summary: string;
  sourceEpisodicId?: string;
  promotedLayers: MemoryLayer[];
  promotedEntryIds: string[];
  graphUpdated: boolean;
  skippedReasons: string[];
}

export interface MemoryStoreQuery {
  layers?: MemoryLayer[];
  keywords?: string[];
  exposureLevel?: ExposureLevel;
  limit?: number;
  focusPath?: string;
  includeArchived?: boolean;
}

export interface MemoryWriteResult {
  entry: MemoryEntry;
  path: string;
  created: boolean;
}
