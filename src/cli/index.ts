import { dirname, resolve } from "node:path";

import { createFileMemoryStore } from "../core/memory-store.js";
import { createHippoRuntime } from "../core/runtime.js";
import { ensureDir, fileExists, writeFileAtomic } from "../utils/fs.js";
import {
  EXPOSURE_LEVELS,
  MEMORY_LAYERS,
  type ActiveRecallCommandInput,
  type AssociateCommandInput,
  type CommandEnvelope,
  type ForecastCommandInput,
  type DeepSleepCommandInput,
  type DeepSleepResult,
  type ExposureLevel,
  type HippoCommandName,
  type MemoryLayer,
  type PruneCommandInput,
  type ProjectOnboardCommandInput,
  type RecallCommandInput,
  type RecallResult,
  type ReflectCommandInput,
  type RiskLevel,
  type StatusCommandInput,
  type SleepCommandInput
} from "../core/types.js";

const CLI_SUBCOMMANDS = [
  "help",
  "commands",
  "init",
  "validate",
  "recall",
  "associate",
  "active-recall",
  "project-onboard",
  "forecast",
  "reflect",
  "sleep",
  "prune",
  "status",
  "deep-sleep"
] as const;
const PROMOTABLE_MEMORY_LAYERS = ["decision", "incident", "pattern", "module"] as const;
const SLEEP_SIGNAL_STRENGTHS = ["low", "medium", "high"] as const;
const RISK_LEVELS = ["low", "medium", "high"] as const;

type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];
type SleepSignalStrength = (typeof SLEEP_SIGNAL_STRENGTHS)[number];
type CliRiskLevel = (typeof RISK_LEVELS)[number];

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

type InitHost = "claude" | "codex" | "both";

interface InitCliResult {
  command: "init";
  target: string;
  host: InitHost;
  created: string[];
  skipped: string[];
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
    maturity: "implemented"
  },
  {
    name: "/hippo:active-recall",
    description: "在高风险任务前触发更主动的 recall。",
    maturity: "implemented"
  },
  {
    name: "/hippo:deep-sleep",
    description: "把已验证的候选记忆晋升到长期层。",
    maturity: "implemented"
  },
  {
    name: "/hippo:project-onboard",
    description: "建立或刷新项目画像与当前焦点。",
    maturity: "implemented"
  },
  {
    name: "/hippo:prune",
    description: "生成只读 prune 建议，识别低价值或过时的记忆。",
    maturity: "implemented"
  },
  {
    name: "/hippo:status",
    description: "查看记忆系统当前状态与候选积压。",
    maturity: "implemented"
  }
];

export function listImplementedCliCommands(): CliCommandDescriptor[] {
  return CLI_COMMANDS.filter((command) => command.maturity === "implemented");
}

export async function runCli(argv: string[], options: CliRunOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? console;

  try {
    const parsed = parseCliArgs(argv);

    if (parsed.helpRequested || parsed.command === "help") {
      io.log(renderHelp());
      return 0;
    }

    switch (parsed.command) {
      case "commands":
        emitJsonMaybe(listImplementedCliCommands(), getBooleanOption(parsed.options, "json"), io);
        if (!getBooleanOption(parsed.options, "json")) {
          io.log(renderImplementedCommands());
        }
        return 0;
      case "validate":
        return await runValidateCommand(parsed.options, cwd, io);
      case "init":
        return await runInitCommand(parsed.options, cwd, io);
      case "recall":
        return await runRecallCommand(parsed.options, cwd, io);
      case "associate":
        return await runAssociateCommand(parsed.options, cwd, io);
      case "active-recall":
        return await runActiveRecallCommand(parsed.options, cwd, io);
      case "project-onboard":
        return await runProjectOnboardCommand(parsed.options, cwd, io);
      case "forecast":
        return await runForecastCommand(parsed.options, cwd, io);
      case "reflect":
        return await runReflectCommand(parsed.options, cwd, io);
      case "sleep":
        return await runSleepCommand(parsed.options, cwd, io);
      case "prune":
        return await runPruneCommand(parsed.options, cwd, io);
      case "status":
        return await runStatusCommand(parsed.options, cwd, io);
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

async function runInitCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const host = parseInitHost(getStringOption(options, "host") ?? "both");
  const targetOption = getStringOption(options, "target");
  if (targetOption === "true") {
    throw new CliUsageError("--target 需要提供目标路径。");
  }

  const target = resolve(cwd, targetOption ?? ".");
  const force = getBooleanOption(options, "force");
  const targets = collectInitTargets(target, host);
  const created: string[] = [];
  const skipped: string[] = [];

  for (const item of targets) {
    if (!force && (await fileExists(item.path))) {
      skipped.push(item.path);
      continue;
    }

    await ensureDir(dirname(item.path));
    await writeFileAtomic(item.path, item.content);
    created.push(item.path);
  }

  const result: InitCliResult = {
    command: "init",
    target,
    host,
    created,
    skipped
  };

  if (getBooleanOption(options, "json")) {
    emitJsonMaybe(result, true, io);
    return 0;
  }

  io.log("Hippocode init 完成。");
  io.log(`target: ${result.target}`);
  io.log(`host: ${result.host}`);
  io.log(`created (${result.created.length}):`);
  for (const path of result.created) {
    io.log(`- ${path}`);
  }
  io.log(`skipped (${result.skipped.length}):`);
  for (const path of result.skipped) {
    io.log(`- ${path}`);
  }
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

async function runAssociateCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: AssociateCommandInput = {
    prompt: requireStringOption(options, "prompt"),
    scope: parseRecallScope(getStringOption(options, "scope") ?? "task")
  };
  const intent = getStringOption(options, "intent");
  const focusPath = getStringOption(options, "focus-path");
  const filters = getMultiValueOption(options, "filter");
  const seedIds = getMultiValueOption(options, "seed-id");
  const exposure = getStringOption(options, "exposure");
  const limit = getStringOption(options, "limit");
  const depth = getStringOption(options, "depth");

  if (intent) {
    input.intent = intent;
  }

  if (focusPath) {
    input.focusPath = focusPath;
  }

  if (filters.length > 0) {
    input.filters = filters;
  }

  if (seedIds.length > 0) {
    input.seedIds = seedIds;
  }

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (limit) {
    input.limit = parsePositiveInteger(limit, "limit");
  }

  if (depth) {
    input.depth = parsePositiveInteger(depth, "depth");
  }

  const response = await createRuntime(cwd, options).executeAssociate(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runActiveRecallCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: ActiveRecallCommandInput = {
    prompt: requireStringOption(options, "prompt"),
    scope: parseRecallScope(getStringOption(options, "scope") ?? "task")
  };
  const intent = getStringOption(options, "intent");
  const focusPath = getStringOption(options, "focus-path");
  const filters = getMultiValueOption(options, "filter");
  const exposure = getStringOption(options, "exposure");
  const limit = getStringOption(options, "limit");
  const riskProfile = getStringOption(options, "risk-profile");

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

  if (riskProfile) {
    input.riskProfile = parseRiskLevel(riskProfile);
  }

  const response = await createRuntime(cwd, options).executeActiveRecall(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runProjectOnboardCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const focusAreas = getMultiValueOption(options, "focus");

  if (focusAreas.length === 0) {
    throw new CliUsageError("project-onboard 至少需要一个 --focus。");
  }

  const input: ProjectOnboardCommandInput = {
    projectName: requireStringOption(options, "project-name"),
    projectSummary: requireStringOption(options, "project-summary"),
    currentPhase: requireStringOption(options, "current-phase"),
    focusAreas,
    constraints: getMultiValueOption(options, "constraint")
  };
  const risks = getMultiValueOption(options, "risk");
  const moduleHints = getMultiValueOption(options, "module-hint");
  const host = getStringOption(options, "host");
  const exposure = getStringOption(options, "exposure");

  if (risks.length > 0) {
    input.risks = risks;
  }

  if (moduleHints.length > 0) {
    input.moduleHints = moduleHints;
  }

  if (host) {
    input.host = host;
  }

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  const response = await createRuntime(cwd, options).executeProjectOnboard(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runForecastCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: ForecastCommandInput = {
    taskDescription: requireStringOption(options, "task"),
    constraints: getMultiValueOption(options, "constraint")
  };
  const dependencies = getMultiValueOption(options, "dependency");
  const riskProfile = getStringOption(options, "risk-profile");
  const exposure = getStringOption(options, "exposure");

  if (dependencies.length > 0) {
    input.dependencies = dependencies;
  }

  if (riskProfile) {
    input.riskProfile = parseRiskLevel(riskProfile);
  }

  if (exposure) {
    input.targetExposure = parseExposureLevel(exposure);
  }

  const response = await createRuntime(cwd, options).executeForecast(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runReflectCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const sessionEvents = getMultiValueOption(options, "session-event");

  if (sessionEvents.length === 0) {
    throw new CliUsageError("reflect 至少需要一个 --session-event。");
  }

  const input: ReflectCommandInput = {
    sessionEvents,
    outcome: requireStringOption(options, "outcome")
  };
  const anomalies = getMultiValueOption(options, "anomaly");
  const lessons = getMultiValueOption(options, "lesson");
  const timeRange = getStringOption(options, "time-range");

  if (anomalies.length > 0) {
    input.anomalies = anomalies;
  }

  if (lessons.length > 0) {
    input.lessons = lessons;
  }

  if (timeRange) {
    input.timeRange = timeRange;
  }

  const response = await createRuntime(cwd, options).executeReflect(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runSleepCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: SleepCommandInput = {
    summary: requireStringOption(options, "summary"),
    touchedFiles: getMultiValueOption(options, "touched-file"),
    validation: getMultiValueOption(options, "validation")
  };
  const tags = getMultiValueOption(options, "tag");
  const exposure = getStringOption(options, "exposure");
  const signalStrength = getStringOption(options, "signal-strength");

  if (tags.length > 0) {
    input.tags = tags;
  }

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (signalStrength) {
    input.signalStrength = parseSignalStrength(signalStrength);
  }

  const response = await createRuntime(cwd, options).executeSleep(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runStatusCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: StatusCommandInput = {};
  const exposure = getStringOption(options, "exposure");
  const includeArchived = getBooleanOption(options, "include-archived");
  const recentLimit = getStringOption(options, "recent-limit");

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (includeArchived) {
    input.includeArchived = true;
  }

  if (recentLimit) {
    input.recentLimit = parsePositiveInteger(recentLimit, "recent-limit");
  }

  const response = await createRuntime(cwd, options).executeStatus(input);
  renderEnvelope(response, getBooleanOption(options, "json"), io);
  return response.status === "error" ? 1 : 0;
}

async function runPruneCommand(
  options: Map<string, string[]>,
  cwd: string,
  io: CliIo
): Promise<number> {
  const input: PruneCommandInput = {};
  const exposure = getStringOption(options, "exposure");
  const includeArchived = getBooleanOption(options, "include-archived");
  const limit = getStringOption(options, "limit");
  const minConfidence = getStringOption(options, "min-confidence");
  const staleDays = getStringOption(options, "stale-days");
  const episodicBacklogThreshold = getStringOption(options, "episodic-backlog-threshold");

  if (exposure) {
    input.exposureLevel = parseExposureLevel(exposure);
  }

  if (includeArchived) {
    input.includeArchived = true;
  }

  if (limit) {
    input.limit = parsePositiveInteger(limit, "limit");
  }

  if (minConfidence) {
    input.minConfidence = parseConfidenceThreshold(minConfidence, "min-confidence");
  }

  if (staleDays) {
    input.staleDays = parsePositiveInteger(staleDays, "stale-days");
  }

  if (episodicBacklogThreshold) {
    input.episodicBacklogThreshold = parsePositiveInteger(
      episodicBacklogThreshold,
      "episodic-backlog-threshold"
    );
  }

  const response = await createRuntime(cwd, options).executePrune(input);
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
    "  hippocode init [--target <path>] [--host claude|codex|both] [--force] [--json]",
    "  hippocode validate [--memory-root .memory] [--json]",
    "  hippocode recall --prompt <text> [--scope task|module|project] [--intent <text>] [--focus-path <path>] [--filter <value>] [--exposure summary|focused|full] [--limit <n>] [--memory-root <path>] [--json]",
    "  hippocode associate --prompt <text> [--scope task|module|project] [--seed-id <id>] [--depth <n:1-2>] [--intent <text>] [--focus-path <path>] [--filter <value>] [--exposure summary|focused|full] [--limit <n>] [--memory-root <path>] [--json]",
    "  hippocode active-recall --prompt <text> [--scope task|module|project] [--risk-profile low|medium|high] [--intent <text>] [--focus-path <path>] [--filter <value>] [--exposure summary|focused|full] [--limit <n>] [--memory-root <path>] [--json]",
    "  hippocode project-onboard --project-name <text> --project-summary <text> --current-phase <text> --focus <text> [--focus <text>...] [--constraint <text>] [--risk <text>] [--module-hint <text>] [--host <name>] [--exposure summary|focused|full] [--memory-root <path>] [--json]",
    "  hippocode forecast --task <text> [--constraint <text>] [--dependency <id>] [--risk-profile low|medium|high] [--exposure summary|focused|full] [--memory-root <path>] [--json]",
    "  hippocode reflect --session-event <text> [--session-event <text>...] --outcome <text> [--anomaly <text>] [--lesson <text>] [--time-range <iso-interval>] [--memory-root <path>] [--json]",
    "  hippocode sleep --summary <text> [--touched-file <path>] [--validation <item>] [--tag <tag>] [--exposure summary|focused|full] [--signal-strength low|medium|high] [--memory-root <path>] [--json]",
    "  hippocode prune [--exposure summary|focused|full] [--include-archived] [--limit <n>] [--min-confidence <0-1>] [--stale-days <n>] [--episodic-backlog-threshold <n>] [--memory-root <path>] [--json]",
    "  hippocode status [--exposure summary|focused|full] [--include-archived] [--recent-limit <n>] [--memory-root <path>] [--json]",
    "  hippocode deep-sleep --summary <text> --candidate-layer <layer> [--candidate-layer <layer>...] [--touched-file <path>] [--validation <item>] [--source-episodic-id <id>] [--tag <tag>] [--exposure summary|focused|full] [--signal-strength low|medium|high] [--memory-root <path>] [--json]",
    "",
    "说明：",
    "  - 多值参数可重复传入，例如 --filter recall --filter runtime",
    "  - project-onboard 当前只维护 project-profile、current-focus 与基础 project graph 节点",
    "  - init 只初始化 Claude/Codex 的最小 Hippocode 插件目录说明文件，不会接入真实 hook 自动化",
    "  - associate / active-recall 当前都是只读命令，基于 recall engine 做关系扩散与风险前置召回",
    "  - associate 的 --depth 当前运行时会收敛到 1~2 跳范围",
    "  - forecast / reflect / sleep 目前直接对接最小 runtime，不额外实现 recallSnapshot / priorForecast 注入",
    "  - prune 当前只返回只读建议，不会直接删除记忆条目或改写 graph",
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

function parseInitHost(value: string): InitHost {
  if (value === "claude" || value === "codex" || value === "both") {
    return value;
  }

  throw new CliUsageError(`--host 必须是 claude、codex 或 both，实际收到 ${value}。`);
}

function collectInitTargets(
  targetRoot: string,
  host: InitHost
): Array<{ path: string; content: string }> {
  const targets: Array<{ path: string; content: string }> = [];

  if (host === "claude" || host === "both") {
    targets.push(...createHostInitFiles(targetRoot, "claude"));
  }

  if (host === "codex" || host === "both") {
    targets.push(...createHostInitFiles(targetRoot, "codex"));
  }

  return targets;
}

function createHostInitFiles(
  targetRoot: string,
  host: "claude" | "codex"
): Array<{ path: string; content: string }> {
  const root = `.${host}`;

  return [
    {
      path: resolve(targetRoot, `${root}/README.md`),
      content: createHostReadme(host, "root")
    },
    {
      path: resolve(targetRoot, `${root}/skills/hippo/README.md`),
      content: createHostReadme(host, "skills")
    },
    {
      path: resolve(targetRoot, `${root}/hooks/README.md`),
      content: createHostReadme(host, "hooks")
    }
  ];
}

function createHostReadme(
  host: "claude" | "codex",
  kind: "root" | "skills" | "hooks"
): string {
  const hostName = host === "claude" ? "Claude Code" : "Codex CLI";

  if (kind === "root") {
    return host === "claude"
      ? [
          "# Claude Host Template",
          "",
          "`.claude/` 用于放置 Hippocode 在 Claude Code 宿主中的轻量模板骨架。",
          "",
          "当前阶段目标：",
          "- 说明 Claude host 下建议如何组织 `/hippo:` 命令与生命周期触发点",
          "- 为后续人工接线预留稳定目录结构",
          "",
          "当前阶段不做：",
          "- 不实现真实 hook 自动化 wiring",
          "- 不假设 Claude Code 已自动识别本目录",
          "- 不在本目录内固化任何会直接写入长期记忆的自动流程",
          "",
          "目录职责：",
          "- `.claude/hooks/README.md`：记录生命周期 hook 的建议触发点与人工接线要求",
          "- `.claude/skills/hippo/README.md`：记录 `/hippo:` 命令族在 Claude 侧的轻量映射方式",
          "",
          "共享协议来源：",
          "- `AGENTS.md`",
          "- `docs/commands.md`",
          "- `src/core/types.ts`",
          "",
          "结论：当前目录是模板，不是已接通的插件。"
        ].join("\n")
      : [
          "# Hippocode Codex 模板",
          "",
          "`.codex/` 用于放置 Hippocode 在 Codex 宿主侧的轻量模板与接线说明。",
          "",
          "当前阶段目标：",
          "- 给 Codex 使用者一个可复制、可阅读、可手工接入的目录骨架",
          "- 明确 `/hippo:*` 命令在 Codex 里的推荐映射方式",
          "- 统一 Codex 侧偏好的结构化输出格式",
          "",
          "当前阶段不做：",
          "- 自动注册 Codex hooks",
          "- 自动发现并安装技能",
          "- 自动把 `/hippo:*` 命令接入宿主生命周期",
          "",
          "目录职责：",
          "- `.codex/hooks/README.md`：记录 Codex 场景到 `/hippo:*` 的建议触发点",
          "- `.codex/skills/hippo/README.md`：记录 Codex 侧命令选择路由与输出偏好",
          "",
          "共享协议来源：",
          "- `AGENTS.md`",
          "- `docs/commands.md`",
          "- `src/core/types.ts`",
          "",
          "结论：当前目录是模板，不是已接通的插件。"
        ].join("\n");
  }

  if (kind === "skills") {
    return host === "claude"
      ? [
          "# Hippocode Claude Skills Template",
          "",
          "本目录用于承载 Claude Code 下的 Hippocode 命令族说明与技能模板。",
          "",
          "建议职责：",
          "- 向 Claude 描述 `/hippo:*` 命令语义",
          "- 约束输入上下文与输出包裹结构",
          "- 根据场景推荐下一条命令，而不是伪造自动化成功状态",
          "",
          "推荐命令分组：",
          "- 启动与召回：`/hippo:recall`、`/hippo:associate`、`/hippo:active-recall`",
          "- 预判与状态：`/hippo:forecast`、`/hippo:status`、`/hippo:project-onboard`",
          "- 反思与沉淀：`/hippo:reflect`、`/hippo:sleep`、`/hippo:deep-sleep`、`/hippo:prune`",
          "",
          "输出约束：",
          "- 优先阅读 `payload.humanReadable`，再按需展开 `payload.structured`",
          "- 保留 `telemetry.confidence`、`exposureTrace`、`nextCommandHint`",
          "",
          "人工接线点：",
          "- 需要人工把 README 中的命令说明翻译成宿主技能元数据",
          "- 需要人工把 `/hippo:*` 连接到 CLI 或脚本入口"
        ].join("\n")
      : [
          "# Codex Hippo 技能模板",
          "",
          "本目录用于承载 Hippocode 在 Codex 宿主中的技能说明模板。",
          "",
          "建议职责：",
          "- 告诉 Codex 何时应该考虑调用 `/hippo:*`",
          "- 约束命令返回的 `status / payload / telemetry` 结构",
          "- 明确哪些语义来自 Hippocode 核心协议",
          "",
          "推荐命令路由：",
          "- 最小上下文包：`/hippo:recall`",
          "- 风险与影响面：`/hippo:forecast`、`/hippo:active-recall`",
          "- 联想扩展：`/hippo:associate`",
          "- 收尾沉淀：`/hippo:reflect`、`/hippo:sleep`",
          "- 维护与晋升：`/hippo:status`、`/hippo:prune`、`/hippo:deep-sleep`",
          "",
          "输出偏好：",
          "- 优先保留结构化字段，方便外层 CLI / tool 流消费 `payload.structured`",
          "- 默认 `summary-first`，必要时再升级到 `focused` / `full`",
          "",
          "人工接线点：",
          "- 需要人工决定技能是直接调用 CLI，还是调用外层适配器",
          "- 需要人工决定结果只展示给用户，还是进入外层自动化链路"
        ].join("\n");
  }

  return host === "claude"
    ? [
        "# Claude Hooks Template",
        "",
        "本目录用于描述 Claude Code 生命周期 hook 的建议触发点。",
        "",
        "推荐映射：",
        "- `sessionStart`：优先 `/hippo:recall`，复杂任务补 `/hippo:forecast`",
        "- `preTool`：高影响工具前优先 `/hippo:forecast`，必要时补 `/hippo:associate` / `/hippo:active-recall`",
        "- `postTool`：关键工具执行后优先 `/hippo:reflect`，必要时提示 `/hippo:sleep`",
        "- `sessionEnd`：先 `/hippo:reflect`，再视情况 `/hippo:sleep`",
        "",
        "人工接线要求：",
        "- 需要人工决定哪些事件真正映射为 Claude hook",
        "- `sleep / deep-sleep` 必须保留人工确认",
        "- 当前只提供推荐映射，不包含真实自动化 wiring"
      ].join("\n")
    : [
        "# Codex Hooks 模板",
        "",
        "本目录用于描述 Hippocode 在 Codex 宿主中的 hook 接线建议。",
        "",
        "推荐场景映射：",
        "- 新任务开始前：`/hippo:recall`",
        "- 实施前：`/hippo:forecast`",
        "- 分支判断或遗忘上下文时：`/hippo:associate` / `/hippo:active-recall`",
        "- 阶段完成后：`/hippo:reflect`",
        "- 会话收尾：`/hippo:sleep`",
        "",
        "输出约束：",
        "- 统一回收为 `status / payload / telemetry`",
        "- 不确定时宁可返回 `partial`，也不要伪造高置信结果",
        "",
        "人工接线要求：",
        "- 当前不提供可执行 hook 脚本或自动注册配置",
        "- 维护者需要手工决定触发节点、输入组装方式和失败兜底策略"
      ].join("\n");
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

function parseRiskLevel(value: string): CliRiskLevel {
  if ((RISK_LEVELS as readonly string[]).includes(value)) {
    return value as RiskLevel;
  }

  throw new CliUsageError(
    `--risk-profile 必须是 ${RISK_LEVELS.join("、")} 之一，实际收到 ${value}。`
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

function parseConfidenceThreshold(value: string, optionName: string): number {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new CliUsageError(`--${optionName} 必须是 0 到 1 之间的数字，实际收到 ${value}。`);
  }

  return parsed;
}

class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export type { ValidateCliResult };
