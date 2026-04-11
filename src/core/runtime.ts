import { summarizeText, tokenizeText, uniqueStrings } from "../utils/text.js";
import type { MemoryStore } from "./memory-store.js";
import {
  buildRecallCommand,
  createDefaultRecallPipelineConfig
} from "./recall-engine.js";
import type {
  CommandEnvelope,
  ForecastCommandInput,
  ForecastPlan,
  ForecastStep,
  HippoCommandName,
  MemoryEntry,
  MemoryLayer,
  RecallCommandInput,
  RecallPipelineConfig,
  RecallResult,
  ReflectCommandInput,
  ReflectInsight,
  RiskLevel,
  SleepCommandInput,
  SleepEntry
} from "./types.js";

export interface HippoRuntimeOptions {
  store: MemoryStore;
  recallConfig?: RecallPipelineConfig;
  now?: () => Date;
}

export interface HippoRuntime {
  executeRecall(input: RecallCommandInput): Promise<CommandEnvelope<RecallResult>>;
  executeForecast(input: ForecastCommandInput): Promise<CommandEnvelope<ForecastPlan>>;
  executeReflect(input: ReflectCommandInput): Promise<CommandEnvelope<ReflectInsight>>;
  executeSleep(input: SleepCommandInput): Promise<CommandEnvelope<SleepEntry>>;
  executeCommand(
    command: HippoCommandName,
    input:
      | RecallCommandInput
      | ForecastCommandInput
      | ReflectCommandInput
      | SleepCommandInput
  ): Promise<
    | CommandEnvelope<RecallResult>
    | CommandEnvelope<ForecastPlan>
    | CommandEnvelope<ReflectInsight>
    | CommandEnvelope<SleepEntry>
  >;
}

export function createHippoRuntime(options: HippoRuntimeOptions): HippoRuntime {
  const recallConfig = options.recallConfig ?? createDefaultRecallPipelineConfig();
  const now = options.now ?? (() => new Date());

  async function executeRecall(
    input: RecallCommandInput
  ): Promise<CommandEnvelope<RecallResult>> {
    const queryKeywords = uniqueStrings([
      ...tokenizeText(input.prompt),
      ...tokenizeText(input.intent ?? ""),
      ...(input.filters ?? []).flatMap((filter) => tokenizeText(filter))
    ]);
    const entries = await options.store.queryEntries({
      keywords: queryKeywords,
      limit: Math.max(input.limit ?? 12, recallConfig.compression.maxItems),
      includeArchived: false,
      ...(input.focusPath ? { focusPath: input.focusPath } : {}),
      ...(input.exposureLevel ? { exposureLevel: input.exposureLevel } : {})
    });
    const graph = await options.store.readGraph();

    return buildRecallCommand(input, { entries, graph }, recallConfig);
  }

  async function executeForecast(
    input: ForecastCommandInput
  ): Promise<CommandEnvelope<ForecastPlan>> {
    const recallSnapshot =
      input.recallSnapshot ??
      (
        await executeRecall({
          prompt: input.taskDescription,
          intent: "forecast-bootstrap",
          scope: "task",
          ...(input.targetExposure ? { exposureLevel: input.targetExposure } : {})
        })
      ).payload.structured;
    const riskLevel = determineForecastRisk(input, recallSnapshot);
    const recommendedFocusPath = recallSnapshot.suggestedFocusPaths[0];
    const steps = buildForecastSteps(input, recallSnapshot, riskLevel);
    const constraints = uniqueStrings([
      ...input.constraints,
      ...recallSnapshot.risks.slice(0, 2)
    ]);
    const confidence = steps.length > 0 ? 0.76 : 0.42;

    const structured: ForecastPlan = {
      command: "/hippo:forecast",
      goal: input.taskDescription,
      assumptions: buildForecastAssumptions(input, recallSnapshot),
      constraints,
      ...(recommendedFocusPath ? { recommendedFocusPath } : {}),
      steps,
      followUpCommands: ["/hippo:reflect", "/hippo:sleep"]
    };

    return {
      status: recallSnapshot.matches.length > 0 ? "ok" : "partial",
      payload: {
        humanReadable: summarizeText(
          `已生成 ${steps.length} 步执行预测，当前风险等级为 ${riskLevel}。先锁定 ${recommendedFocusPath ?? "项目约束与当前焦点"}，再沿最小改动路径推进，最后记录偏差并准备 sleep。`,
          260
        ),
        structured
      },
      telemetry: {
        confidence,
        exposureLevel: input.targetExposure ?? "summary",
        dependencies: uniqueStrings([
          ...(input.dependencies ?? []),
          ...recallSnapshot.matches.map((match) => match.entry.id)
        ]),
        exposureTrace: [input.targetExposure ?? "summary"],
        nextCommandHint: "/hippo:reflect"
      }
    };
  }

  async function executeReflect(
    input: ReflectCommandInput
  ): Promise<CommandEnvelope<ReflectInsight>> {
    const deviations = buildReflectDeviations(input);
    const confirmedSignals = uniqueStrings(
      input.sessionEvents.filter((event) => /(pass|success|ok|done|通过|完成|验证)/iu.test(event))
    );
    const misleadingSignals = uniqueStrings([
      ...(input.anomalies ?? []),
      ...input.sessionEvents.filter((event) => /(fail|error|rollback|回滚|失败|误判)/iu.test(event))
    ]);
    const reusableLessons = uniqueStrings([
      ...(input.lessons ?? []),
      ...confirmedSignals.slice(0, 2).map((signal) => `保留有效信号：${signal}`),
      ...deviations.slice(0, 2).map((deviation) => `下次提前规避：${deviation}`)
    ]).slice(0, 5);
    const candidateLayers = determineReflectCandidateLayers(input);
    const episodicRecord = await options.store.writeEntry(
      buildEpisodicEntry({
        id: `reflect-${now().toISOString()}`,
        title: "Reflect Insight",
        summary: input.outcome,
        keywords: uniqueStrings([
          ...tokenizeText(input.outcome),
          ...tokenizeText((input.lessons ?? []).join(" "))
        ]),
        metadata: {
          command: "/hippo:reflect",
          timeRange: input.timeRange,
          deviations,
          confirmedSignals,
          misleadingSignals,
          candidateLayers
        },
        now,
        content: [
          `Outcome: ${input.outcome}`,
          `Deviations: ${deviations.join(" | ") || "none"}`,
          `Confirmed: ${confirmedSignals.join(" | ") || "none"}`,
          `Misleading: ${misleadingSignals.join(" | ") || "none"}`
        ].join("\n")
      })
    );

    const structured: ReflectInsight = {
      command: "/hippo:reflect",
      summary: summarizeText(input.outcome, 220),
      deviations,
      confirmedSignals,
      misleadingSignals,
      reusableLessons,
      ...(candidateLayers.length > 0 ? { candidateLayers } : {}),
      episodicEntryId: episodicRecord.entry.id
    };

    return {
      status: "ok",
      payload: {
        humanReadable: summarizeText(
          `已记录 reflect 结果。最关键的偏差有 ${deviations.length} 条，可靠信号 ${confirmedSignals.length} 条，建议下一步把高价值经验压缩进 /hippo:sleep。`,
          260
        ),
        structured
      },
      telemetry: {
        confidence: reusableLessons.length > 0 ? 0.81 : 0.63,
        exposureLevel: "summary",
        dependencies: candidateLayers,
        exposureTrace: ["summary"],
        nextCommandHint: "/hippo:sleep"
      }
    };
  }

  async function executeSleep(
    input: SleepCommandInput
  ): Promise<CommandEnvelope<SleepEntry>> {
    const candidateLayers = determineSleepCandidateLayers(input);
    const promoteToLongTerm =
      input.signalStrength === "high" && input.validation.length > 0 && candidateLayers.length > 0;
    const episodicRecord = await options.store.writeEntry(
      buildEpisodicEntry({
        id: `sleep-${now().toISOString()}`,
        title: "Sleep Candidate",
        summary: input.summary,
        keywords: uniqueStrings([
          ...tokenizeText(input.summary),
          ...(input.tags ?? []),
          ...input.touchedFiles.flatMap((file) => tokenizeText(file))
        ]),
        metadata: {
          command: "/hippo:sleep",
          touchedFiles: input.touchedFiles,
          validation: input.validation,
          tags: input.tags,
          signalStrength: input.signalStrength ?? "medium",
          candidateLayers,
          promoteToLongTerm
        },
        now,
        content: [
          `Summary: ${input.summary}`,
          `Touched files: ${input.touchedFiles.join(", ") || "none"}`,
          `Validation: ${input.validation.join(", ") || "none"}`,
          `Candidate layers: ${candidateLayers.join(", ") || "episodic"}`
        ].join("\n")
      })
    );

    const structured: SleepEntry = {
      command: "/hippo:sleep",
      summary: summarizeText(input.summary, 220),
      touchedFiles: input.touchedFiles,
      validation: input.validation,
      candidateLayers,
      promoteToLongTerm,
      episodicEntryId: episodicRecord.entry.id
    };

    return {
      status: "ok",
      payload: {
        humanReadable: summarizeText(
          `已将本轮任务压缩为 sleep 候选，并写入 episodic。当前候选层为 ${candidateLayers.join(
            "、"
          ) || "episodic"}，${promoteToLongTerm ? "建议后续进入 /hippo:deep-sleep。" : "暂不建议直接晋升长期层。"} `,
          260
        ),
        structured
      },
      telemetry: {
        confidence: promoteToLongTerm ? 0.84 : 0.68,
        exposureLevel: input.exposureLevel ?? "summary",
        dependencies: uniqueStrings(candidateLayers),
        exposureTrace: [input.exposureLevel ?? "summary"],
        nextCommandHint: promoteToLongTerm ? "/hippo:deep-sleep" : "/hippo:status"
      }
    };
  }

  async function executeCommand(
    command: HippoCommandName,
    input:
      | RecallCommandInput
      | ForecastCommandInput
      | ReflectCommandInput
      | SleepCommandInput
  ): Promise<
    | CommandEnvelope<RecallResult>
    | CommandEnvelope<ForecastPlan>
    | CommandEnvelope<ReflectInsight>
    | CommandEnvelope<SleepEntry>
  > {
    switch (command) {
      case "/hippo:recall":
        return executeRecall(input as RecallCommandInput);
      case "/hippo:forecast":
        return executeForecast(input as ForecastCommandInput);
      case "/hippo:reflect":
        return executeReflect(input as ReflectCommandInput);
      case "/hippo:sleep":
        return executeSleep(input as SleepCommandInput);
      default:
        throw new Error(`当前运行时尚未实现命令 ${command}`);
    }
  }

  return {
    executeRecall,
    executeForecast,
    executeReflect,
    executeSleep,
    executeCommand
  };
}

function buildForecastAssumptions(
  input: ForecastCommandInput,
  recallSnapshot: RecallResult
): string[] {
  const assumptions = [
    recallSnapshot.matches.length > 0
      ? "已有足够的 summary 级项目记忆可用于规划"
      : "当前只能依赖项目画像和当前焦点做保守规划",
    input.constraints.length > 0
      ? "显式约束优先级高于默认启发式"
      : "若执行中发现新约束，应先回到 recall 再更新计划"
  ];

  return uniqueStrings(assumptions);
}

function buildForecastSteps(
  input: ForecastCommandInput,
  recallSnapshot: RecallResult,
  riskLevel: RiskLevel
): ForecastStep[] {
  const focusPath = recallSnapshot.suggestedFocusPaths[0] ?? "project-profile";

  return [
    {
      title: "确认约束与焦点",
      rationale: `先对齐 ${focusPath} 附近的记忆摘要，避免在无 recall 的情况下直接展开大范围修改。`,
      validation: ["检查 recall 命中条目是否覆盖当前任务", "确认关键约束没有遗漏"],
      riskLevel
    },
    {
      title: "沿最小改动路径推进",
      rationale: input.constraints.length > 0
        ? `当前任务受 ${input.constraints.slice(0, 2).join("、")} 约束，应优先从最小变更面切入。`
        : "从最小可验证改动开始，避免一次性扩大影响范围。",
      validation: ["限定改动边界", "对照 recall 风险项逐项检查"],
      riskLevel
    },
    {
      title: "验证并为 reflect 留痕",
      rationale: "执行结束后立即记录验证结果、偏差和误导信号，方便进入 reflect / sleep 闭环。",
      validation: ["记录通过/失败的验证项", "归档偏差与后续风险"],
      riskLevel: riskLevel === "high" ? "high" : "medium"
    }
  ];
}

function determineForecastRisk(
  input: ForecastCommandInput,
  recallSnapshot: RecallResult
): RiskLevel {
  if (input.riskProfile) {
    return input.riskProfile;
  }

  if (recallSnapshot.risks.length > 0 || input.constraints.length >= 3) {
    return "high";
  }

  if (recallSnapshot.matches.length === 0 || input.constraints.length >= 1) {
    return "medium";
  }

  return "low";
}

function buildReflectDeviations(input: ReflectCommandInput): string[] {
  const deviations = [...(input.anomalies ?? [])];

  if (input.priorForecast) {
    for (const step of input.priorForecast.steps) {
      const covered = input.sessionEvents.some((event) =>
        event.toLowerCase().includes(step.title.toLowerCase().slice(0, 4))
      );

      if (!covered) {
        deviations.push(`未完整覆盖预测步骤：${step.title}`);
      }
    }
  }

  if (deviations.length === 0) {
    deviations.push("计划与执行基本一致，仅存在可接受的小偏差");
  }

  return uniqueStrings(deviations).slice(0, 5);
}

function determineReflectCandidateLayers(input: ReflectCommandInput): MemoryLayer[] {
  const layers: MemoryLayer[] = ["episodic"];

  if ((input.anomalies ?? []).length > 0) {
    layers.push("incident");
  }

  if ((input.lessons ?? []).length > 0) {
    layers.push("pattern");
  }

  if (input.priorForecast) {
    layers.push("decision");
  }

  return uniqueStrings(layers) as MemoryLayer[];
}

function determineSleepCandidateLayers(input: SleepCommandInput): MemoryLayer[] {
  const joinedText = [input.summary, ...(input.tags ?? []), ...input.validation].join(" ").toLowerCase();
  const layers: MemoryLayer[] = ["episodic"];

  if (/(incident|bug|regression|回归|故障|事故|error|fail)/iu.test(joinedText)) {
    layers.push("incident");
  }

  if (/(decision|constraint|约束|决策)/iu.test(joinedText)) {
    layers.push("decision");
  }

  if (input.touchedFiles.some((file) => file.includes("src/"))) {
    layers.push("module");
  }

  if ((input.tags ?? []).some((tag) => ["pattern", "workflow", "test"].includes(tag.toLowerCase()))) {
    layers.push("pattern");
  }

  return uniqueStrings(layers) as MemoryLayer[];
}

function buildEpisodicEntry(options: {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  metadata: Record<string, unknown>;
  content: string;
  now: () => Date;
}): MemoryEntry {
  const createdAt = options.now().toISOString();

  return {
    id: options.id,
    layer: "episodic",
    title: options.title,
    summary: summarizeText(options.summary, 240),
    keywords: uniqueStrings(options.keywords).slice(0, 12),
    scope: "session",
    exposure: "summary",
    content: options.content,
    createdAt,
    updatedAt: createdAt,
    metadata: options.metadata
  };
}
