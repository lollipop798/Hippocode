import {
  EXPOSURE_LEVELS,
  MEMORY_LAYERS,
  type ExposureLevel,
  type MemoryEntry,
  type MemoryGraphEdge,
  type MemoryGraphNode,
  type MemoryGraphSnapshot,
  type MemoryLayer
} from "./types.js";

const MEMORY_LAYER_SET = new Set<string>(MEMORY_LAYERS);
const EXPOSURE_LEVEL_SET = new Set<string>(EXPOSURE_LEVELS);
const GRAPH_NODE_TYPE_SET = new Set<string>([...MEMORY_LAYERS, "constraint", "task"]);
const GRAPH_EDGE_TYPE_SET = new Set<string>([
  "related_to",
  "depends_on",
  "caused_by",
  "mitigated_by",
  "implements",
  "observed_in",
  "constrains",
  "applies_to",
  "describes",
  "risks",
  "mitigates"
]);

export class MemorySchemaValidationError extends Error {
  public readonly issues: string[];

  public constructor(message: string, issues: string[]) {
    super([message, ...issues.map((issue) => `- ${issue}`)].join("\n"));
    this.name = "MemorySchemaValidationError";
    this.issues = issues;
  }
}

export function validateMemoryEntry(entry: unknown, context = "memory entry"): string[] {
  const issues: string[] = [];

  if (!isRecord(entry)) {
    return [`${context} 必须是对象。`];
  }

  assertNonEmptyString(entry.id, `${context}.id`, issues);
  assertMemoryLayer(entry.layer, `${context}.layer`, issues);
  assertNonEmptyString(entry.title, `${context}.title`, issues);
  assertNonEmptyString(entry.summary, `${context}.summary`, issues);
  assertStringArray(entry.keywords, `${context}.keywords`, issues, true);
  assertNonEmptyString(entry.scope, `${context}.scope`, issues);
  assertExposureLevel(entry.exposure, `${context}.exposure`, issues);
  assertIsoDate(entry.createdAt, `${context}.createdAt`, issues);

  if ("updatedAt" in entry && entry.updatedAt !== undefined) {
    assertIsoDate(entry.updatedAt, `${context}.updatedAt`, issues);
  }

  if ("content" in entry && entry.content !== undefined) {
    assertString(entry.content, `${context}.content`, issues);
  }

  if ("tags" in entry && entry.tags !== undefined) {
    assertStringArray(entry.tags, `${context}.tags`, issues, false);
  }

  if ("references" in entry && entry.references !== undefined) {
    assertStringArray(entry.references, `${context}.references`, issues, false);
  }

  if ("sourcePath" in entry && entry.sourcePath !== undefined) {
    assertString(entry.sourcePath, `${context}.sourcePath`, issues);
  }

  if ("confidence" in entry && entry.confidence !== undefined) {
    assertNumber(entry.confidence, `${context}.confidence`, issues);
  }

  if ("metadata" in entry && entry.metadata !== undefined && !isRecord(entry.metadata)) {
    issues.push(`${context}.metadata 必须是对象。`);
  }

  return issues;
}

export function validateWriteEntryInput(entry: unknown, context = "write entry input"): string[] {
  return validateMemoryEntry(entry, context);
}

export function validateMemoryGraphSnapshot(
  snapshot: unknown,
  context = "memory graph snapshot"
): string[] {
  const issues: string[] = [];

  if (!isRecord(snapshot)) {
    return [`${context} 必须是对象。`];
  }

  assertNonEmptyString(snapshot.version, `${context}.version`, issues);
  assertIsoDate(snapshot.updatedAt, `${context}.updatedAt`, issues);

  if (!Array.isArray(snapshot.nodes)) {
    issues.push(`${context}.nodes 必须是数组。`);
  } else {
    snapshot.nodes.forEach((node, index) => {
      issues.push(...validateMemoryGraphNode(node, `${context}.nodes[${index}]`));
    });
  }

  if (!Array.isArray(snapshot.edges)) {
    issues.push(`${context}.edges 必须是数组。`);
  } else {
    snapshot.edges.forEach((edge, index) => {
      issues.push(...validateMemoryGraphEdge(edge, `${context}.edges[${index}]`));
    });
  }

  return issues;
}

export function assertValidMemoryEntry(entry: unknown, context?: string): asserts entry is MemoryEntry {
  const issues = validateMemoryEntry(entry, context);

  if (issues.length > 0) {
    throw new MemorySchemaValidationError(context ?? "memory entry 校验失败", issues);
  }
}

export function assertValidWriteEntryInput(
  entry: unknown,
  context?: string
): asserts entry is MemoryEntry {
  const issues = validateWriteEntryInput(entry, context);

  if (issues.length > 0) {
    throw new MemorySchemaValidationError(context ?? "write entry input 校验失败", issues);
  }
}

export function assertValidMemoryGraphSnapshot(
  snapshot: unknown,
  context?: string
): asserts snapshot is MemoryGraphSnapshot {
  const issues = validateMemoryGraphSnapshot(snapshot, context);

  if (issues.length > 0) {
    throw new MemorySchemaValidationError(context ?? "memory graph snapshot 校验失败", issues);
  }
}

function validateMemoryGraphNode(node: unknown, context: string): string[] {
  const issues: string[] = [];

  if (!isRecord(node)) {
    return [`${context} 必须是对象。`];
  }

  assertNonEmptyString(node.id, `${context}.id`, issues);

  if (!isNonEmptyString(node.type) || !GRAPH_NODE_TYPE_SET.has(node.type)) {
    issues.push(`${context}.type 必须是合法的 graph node type。`);
  }

  assertNonEmptyString(node.title, `${context}.title`, issues);
  assertNonEmptyString(node.summary, `${context}.summary`, issues);
  assertStringArray(node.keywords, `${context}.keywords`, issues, true);
  assertMemoryLayer(node.layer, `${context}.layer`, issues);
  assertNumber(node.weight, `${context}.weight`, issues);

  if ("confidence" in node && node.confidence !== undefined) {
    assertNumber(node.confidence, `${context}.confidence`, issues);
  }

  if ("lastValidated" in node && node.lastValidated !== undefined) {
    assertIsoDate(node.lastValidated, `${context}.lastValidated`, issues);
  }

  if ("metadata" in node && node.metadata !== undefined && !isRecord(node.metadata)) {
    issues.push(`${context}.metadata 必须是对象。`);
  }

  return issues;
}

function validateMemoryGraphEdge(edge: unknown, context: string): string[] {
  const issues: string[] = [];

  if (!isRecord(edge)) {
    return [`${context} 必须是对象。`];
  }

  assertNonEmptyString(edge.from, `${context}.from`, issues);
  assertNonEmptyString(edge.to, `${context}.to`, issues);

  if (!isNonEmptyString(edge.type) || !GRAPH_EDGE_TYPE_SET.has(edge.type)) {
    issues.push(`${context}.type 必须是合法的 graph edge type。`);
  }

  assertNumber(edge.weight, `${context}.weight`, issues);
  assertNonEmptyString(edge.reason, `${context}.reason`, issues);

  if ("metadata" in edge && edge.metadata !== undefined && !isRecord(edge.metadata)) {
    issues.push(`${context}.metadata 必须是对象。`);
  }

  return issues;
}

function assertMemoryLayer(value: unknown, path: string, issues: string[]): asserts value is MemoryLayer {
  if (!isNonEmptyString(value) || !MEMORY_LAYER_SET.has(value)) {
    issues.push(`${path} 必须是合法的 memory layer。`);
  }
}

function assertExposureLevel(
  value: unknown,
  path: string,
  issues: string[]
): asserts value is ExposureLevel {
  if (!isNonEmptyString(value) || !EXPOSURE_LEVEL_SET.has(value)) {
    issues.push(`${path} 必须是合法的 exposure level。`);
  }
}

function assertIsoDate(value: unknown, path: string, issues: string[]): void {
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    issues.push(`${path} 必须是合法的 ISO 日期字符串。`);
  }
}

function assertNonEmptyString(value: unknown, path: string, issues: string[]): void {
  if (!isNonEmptyString(value)) {
    issues.push(`${path} 必须是非空字符串。`);
  }
}

function assertString(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== "string") {
    issues.push(`${path} 必须是字符串。`);
  }
}

function assertStringArray(
  value: unknown,
  path: string,
  issues: string[],
  requireNonEmpty: boolean
): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} 必须是字符串数组。`);
    return;
  }

  if (requireNonEmpty && value.length === 0) {
    issues.push(`${path} 不能为空数组。`);
  }

  if (value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    issues.push(`${path} 中的每一项都必须是非空字符串。`);
  }
}

function assertNumber(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push(`${path} 必须是数字。`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const MEMORY_GRAPH_EDGE_TYPES = [...GRAPH_EDGE_TYPE_SET];
export const MEMORY_GRAPH_NODE_TYPES = [...GRAPH_NODE_TYPE_SET];
export type MemoryGraphNodeType = MemoryGraphNode["type"];
export type MemoryGraphEdgeType = MemoryGraphEdge["type"];
