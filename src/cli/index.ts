import { resolve } from "node:path";

import { createFileMemoryStore } from "../core/memory-store.js";
import { createHippoRuntime } from "../core/runtime.js";
import {
  EXPOSURE_LEVELS,
  MEMORY_LAYERS,
  type CommandEnvelope,
  type DeepSleepCommandInput,
  type DeepSleepResult,
  type ExposureLevel,
  type HippoCommandName,
  type MemoryLayer,
  type RecallCommandInput,
  type RecallResult
} from "../core/types.js";

const CLI_SUBCOMMANDS = ["help", "commands", "validate", "recall", "deep-sleep"] as const;
const PROMOTABLE_MEMORY_LAYERS = ["decision", "incident", "pattern", "module"] as const;
const SLEEP_SIGNAL_STRENGTHS = ["low", "medium", "high"] as const;

type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];
type SleepSignalStrength = (typeof SLEEP_SIGNAL_STRENGTHS)[number];

export interface CliCommandDescriptor {
  name: HippoCommandName;
  description: string;
  maturity: "documented" | "planned" | "implemented";
}

export interface CliIo {
  log(message: string): void;
  error(message: string): void;
}

export interface CliRunOptions {
  cwd?: string;
  io?: CliIo;
}

interface ParsedCliArgs {
  command: CliSubcommand;
  options: Map<string, string[]>;
  helpRequested: boolean;
}

interface ValidateCliResult {
  command: "validate";
  memoryRoot: string;
  entries: number;
  graphNodes: number;
  graphEdges: number;
}

export const CLI_COMMANDS: CliCommandDescriptor[] = [
  {
    name: "/hippo:recall",
    description: "召回当前任务最相关的项目记忆摘要。",
    maturity: "implemented"
  },
  {
    name: "/hippo:forecast",
    description: "根据 recall 结果给出执行路径预测与验证点。",
    maturity: "implemented"
  },
  {
    name: "/hippo:reflect",
    description: "在执行后记录偏差、有效信号与可复用经验。",
    maturity: "implemented"
  },
  {
    name: "/hippo:sleep",
    description: "将当前任务压缩为 episodic 记忆候选。",
    maturity: "implemented"
  },
  {
    name: "/hippo:associate",
    description: "做更深一层的关系扩散与联想召回。",
    maturity: "planned"
  },
  {
    name: "/hippo:active-recall",
    description: "在高风险任务前触发更主动的 recall。",
    maturity: "planned"
  },
  {
    name: "/hippo:deep-sleep",
    description: "把已验证的候选记忆晋升到长期层。",
    maturity: "implemented"
  },
  {
    name: "/hippo:project-onboard",
    description: "建立或刷新项目画像与当前焦点。",
    maturity: "documented"
  },
  {
    name: "/hippo:prune",
    description: "清理低价值或过时的记忆。",
    maturity: "documented"
  },
  {
    name: "/hippo:status",
    description: "查看记忆系统当前状态与候选积压。",
    maturity: "documented"
  }
];

export function listImplementedCliCommands(): CliCommandDescriptor[] {
  return CLI_COMMANDS.filter((command) => command.maturity === "implemented");
}

export async function runCli(argv: string[], options: CliRunOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? console;
  const parsed = parseCliArgs(argv);

  if (parsed.helpRequested || parsed.command === "help") {
    io.log(renderHelp());
    return 0;
  }

  try {
    switch (parsed.command) {
      case "commands":
        emitJsonMaybe(listImplementedCliCommands(), getBooleanOption(parsed.options, "json"), io);
        if (!getBooleanOption(parsed.options, "json")) {
          io.log(renderImplementedCommands());
        }
        return 0;
      case "validate":
        return await runValidateCommand(parsed.options, cwd, io);
      case "recall":
        return await runRecallCommand(parsed.options, cwd, io);
      case "deep-sleep":
        return await runDeepSleepCommand(parsed.options, cwd, io);
      default:
        throw new CliUsageError(`不支持的子命令: ${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.error(`${error.message}\n\n${renderHelp()}`);
      return 2;
    }

    const message = error instanceof Error ? error.message : String(error);
    io.error(`Hippocode CLI 执行失败：\n${message}`);
    return 1;
  }
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [maybeCommand, ...rest] = argv;
  const command = normalizeSubcommand(maybeCommand);
  const options = new Map<string, string[]>();
  let helpRequested = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token) {
      continue;
    }

    if (token === "--help") {
      helpRequested = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new CliUsageError(`无法识别的位置参数: ${token}`);
    }

    const key = token.slice(2);
    const nextToken = rest[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      pushOption(options, key, "true");
      continue;
    }

    pushOption(options, key, nextToken);
    index += 1;
  }

  return {
    command,
    options,
    helpRequested
  };
}

function normalizeSubcommand(value?: string): CliSubcommand {
  if (!value) {
    return "help";
  }

  if ((CLI_SUBCOMMANDS as readonly string[]).includes(value)) {
    return value as CliSubcommand;
  }

  throw new CliUsageError(`不支持的子命令: ${value}`);
}

async function runValidateCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const memoryRoot = resolve(cwd, getStringOption(options, "memory-root") ?? ".memory");
  const store = createFileMemoryStore({
    rootDir: memoryRoot,
    defaultExposure: "full"
  });
  const graph = await store.readGraph();
  const entries = await store.queryEntries({
    includeArchived: true,
    exposureLevel: "full",
    limit: 1000
  });
  const result: ValidateCliResult = {
    command: "validate",
    memoryRoot,
    entries: entries.length,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length
  };

  if (getBooleanOption(options, "json")) {
    emitJsonMaybe(result, true, io);
    return 0;
  }

  io.log(`memoryRoot: ${result.memoryRoot}`);
  io.log(`entries: ${result.entries}`);
  io.log(`graphNodes: ${result.graphNodes}`);
  io.log(`graphEdges: ${result.graphEdges}`);
  return 0;
}

async function runRecallCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const prompt = requireStringOption(options, "prompt");
  const input: RecallCommandInput = {
    prompt,
    scope: parseRecallScope(getStringOption(options, "scope") ?? "task")
  };
  const intent = getStringOption(options, "intent");
  const focusPath = getStringOption(options, "focus-path");
  const filters = getMultiValueOption(options, "filter");
  const exposure = getStringOption(options, "exposure");
  const limit = getStringOption(options, "limit");

  if (intent) {
    input.intent = intent;
  }

  if (focusPath) {
    input.focusPath = focusPath;
  }

  if (filters.length > 0) {
    input.filters = filters;
  }

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (limit) {
    input.limit = parsePositiveInteger(limit, "limit");
  }

  const response = await createRuntime(cwd, options).executeRecall(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runDeepSleepCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const candidateLayers = parseMemoryLayers(
    getMultiValueOption(options, "candidate-layer"),
    "candidate-layer"
  );

  if (candidateLayers.length === 0) {
    throw new CliUsageError("deep-sleep 至少需要一个 --candidate-layer。");
  }

  const input: DeepSleepCommandInput = {
    summary: requireStringOption(options, "summary"),
    touchedFiles: getMultiValueOption(options, "touched-file"),
    validation: getMultiValueOption(options, "validation"),
    candidateLayers
  };
  const sourceEpisodicId = getStringOption(options, "source-episodic-id");
  const tags = getMultiValueOption(options, "tag");
  const exposure = getStringOption(options, "exposure");
  const signalStrength = getStringOption(options, "signal-strength");

  if (sourceEpisodicId) {
    input.sourceEpisodicId = sourceEpisodicId;
  }

  if (tags.length > 0) {
    input.tags = tags;
  }

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (signalStrength) {
    input.signalStrength = parseSignalStrength(signalStrength);
  }

  const response = await createRuntime(cwd, options).executeDeepSleep(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

function createRuntime(cwd: string, options: Map<string, string[]>) {
  const memoryRoot = resolve(cwd, getStringOption(options, "memory-root") ?? ".memory");
  const store = createFileMemoryStore({
    rootDir: memoryRoot
  });

  return createHippoRuntime({ store });
}

function renderEnvelope<T>(
  envelope: CommandEnvelope<T>,
  asJson: boolean,
  io: CliIo
): void {
  if (asJson) {
    emitJsonMaybe(envelope, true, io);
    return;
  }

  io.log(`status: ${envelope.status}`);
  io.log(envelope.payload.humanReadable);
  io.log(`structured: ${JSON.stringify(envelope.payload.structured, null, 2)}`);
  io.log(`telemetry: ${JSON.stringify(envelope.telemetry, null, 2)}`);
}

function renderHelp(): string {
  return [
    "Hippocode CLI",
    "",
    "用法：",
    "  hippocode help",
    "  hippocode commands [--json]",
    "  hippocode validate [--memory-root .memory] [--json]",
    "  hippocode recall --prompt <text> [--scope task|module|project] [--intent <text>] [--focus-path <path>] [--filter <value>] [--exposure summary|focused|full] [--limit <n>] [--memory-root <path>] [--json]",
    "  hippocode deep-sleep --summary <text> --candidate-layer <layer> [--candidate-layer <layer>...] [--touched-file <path>] [--validation <item>] [--source-episodic-id <id>] [--tag <tag>] [--exposure summary|focused|full] [--signal-strength low|medium|high] [--memory-root <path>] [--json]",
    "",
    "说明：",
    "  - 多值参数可重复传入，例如 --filter recall --filter runtime",
    "  - deep-sleep 当前只会真正晋升 decision、incident、pattern、module 层",
    "  - validate 按当前 FileMemoryStore 约定校验 memory root 与 graph 快照"
  ].join("\n");
}

function renderImplementedCommands(): string {
  return [
    "已实现命令：",
    ...listImplementedCliCommands().map(
      (command) => `- ${command.name} (${command.maturity}): ${command.description}`
    )
  ].join("\n");
}

function emitJsonMaybe(value: unknown, asJson: boolean, io: CliIo): void {
  if (!asJson) {
    return;
  }

  io.log(JSON.stringify(value, null, 2));
}

function pushOption(options: Map<string, string[]>, key: string, value: string): void {
  const current = options.get(key) ?? [];
  current.push(value);
  options.set(key, current);
}

function getStringOption(options: Map<string, string[]>, key: string): string | undefined {
  const values = options.get(key);
  return values?.at(-1);
}

function requireStringOption(options: Map<string, string[]>, key: string): string {
  const value = getStringOption(options, key);

  if (!value || value === "true") {
    throw new CliUsageError(`缺少必填参数 --${key}。`);
  }

  return value;
}

function getBooleanOption(options: Map<string, string[]>, key: string): boolean {
  return getStringOption(options, key) === "true";
}

function getMultiValueOption(options: Map<string, string[]>, key: string): string[] {
  return (options.get(key) ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== "true");
}

function parseRecallScope(value: string): RecallCommandInput["scope"] {
  if (value === "task" || value === "module" || value === "project") {
    return value;
  }

  throw new CliUsageError(`--scope 必须是 task、module 或 project，实际收到 ${value}。`);
}

function parseExposureLevel(value: string): ExposureLevel {
  if ((EXPOSURE_LEVELS as readonly string[]).includes(value)) {
    return value as ExposureLevel;
  }

  throw new CliUsageError(
    `--exposure 必须是 ${EXPOSURE_LEVELS.join("、")} 之一，实际收到 ${value}。`
  );
}

function parseMemoryLayers(values: string[], optionName: string): MemoryLayer[] {
  const normalized = values.map((value) => {
    if ((MEMORY_LAYERS as readonly string[]).includes(value)) {
      return value as MemoryLayer;
    }

    throw new CliUsageError(
      `--${optionName} 必须是 ${MEMORY_LAYERS.join("、")} 之一，实际收到 ${value}。`
    );
  });

  return Array.from(new Set(normalized));
}

function parseSignalStrength(value: string): SleepSignalStrength {
  if ((SLEEP_SIGNAL_STRENGTHS as readonly string[]).includes(value)) {
    return value as SleepSignalStrength;
  }

  throw new CliUsageError(
    `--signal-strength 必须是 ${SLEEP_SIGNAL_STRENGTHS.join("、")} 之一，实际收到 ${value}。`
  );
}

export function isPromotableCliLayer(layer: MemoryLayer): boolean {
  return (PROMOTABLE_MEMORY_LAYERS as readonly string[]).includes(layer);
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`--${optionName} 必须是正整数，实际收到 ${value}。`);
  }

  return parsed;
}

class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export type { DeepSleepResult, RecallResult, ValidateCliResult };
