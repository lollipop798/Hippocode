import { summarizeText, tokenizeText, uniqueStrings } from "../utils/text.js";
import type { MemoryStore } from "./memory-store.js";
import {
  buildRecallCommand,
  createDefaultRecallPipelineConfig
} from "./recall-engine.js";
import type {
  CommandEnvelope,
  DeepSleepCommandInput,
  DeepSleepResult,
  ForecastCommandInput,
  ForecastPlan,
  ForecastStep,
  HippoCommandName,
  MemoryEntry,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryGraphSnapshot,
  MemoryLayer,
  PruneCommandInput,
  PruneResult,
  PruneSuggestion,
  ProjectOnboardCommandInput,
  ProjectOnboardResult,
  RecallCommandInput,
  RecallPipelineConfig,
  RecallResult,
  ReflectCommandInput,
  ReflectInsight,
  RiskLevel,
  StatusCommandInput,
  StatusResult,
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
  executeProjectOnboard(
    input: ProjectOnboardCommandInput
  ): Promise<CommandEnvelope<ProjectOnboardResult>>;
  executeForecast(input: ForecastCommandInput): Promise<CommandEnvelope<ForecastPlan>>;
  executeReflect(input: ReflectCommandInput): Promise<CommandEnvelope<ReflectInsight>>;
  executeSleep(input: SleepCommandInput): Promise<CommandEnvelope<SleepEntry>>;
  executeDeepSleep(input: DeepSleepCommandInput): Promise<CommandEnvelope<DeepSleepResult>>;
  executePrune(input?: PruneCommandInput): Promise<CommandEnvelope<PruneResult>>;
  executeStatus(input?: StatusCommandInput): Promise<CommandEnvelope<StatusResult>>;
  executeCommand(
    command: HippoCommandName,
    input:
      | RecallCommandInput
      | ProjectOnboardCommandInput
      | ForecastCommandInput
      | ReflectCommandInput
      | SleepCommandInput
      | DeepSleepCommandInput
      | PruneCommandInput
      | StatusCommandInput
  ): Promise<
    | CommandEnvelope<RecallResult>
    | CommandEnvelope<ProjectOnboardResult>
    | CommandEnvelope<ForecastPlan>
    | CommandEnvelope<ReflectInsight>
    | CommandEnvelope<SleepEntry>
    | CommandEnvelope<DeepSleepResult>
    | CommandEnvelope<PruneResult>
    | CommandEnvelope<StatusResult>
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

  async function executeProjectOnboard(
    input: ProjectOnboardCommandInput
  ): Promise<CommandEnvelope<ProjectOnboardResult>> {
    const focusAreas = uniqueStrings(input.focusAreas).slice(0, 8);
    const constraints = uniqueStrings(input.constraints).slice(0, 8);
    const risks = uniqueStrings(input.risks ?? []).slice(0, 8);
    const moduleHints = uniqueStrings(input.moduleHints ?? []).slice(0, 8);
    const host = input.host?.trim();

    await options.store.writeEntry(
      buildProjectMarkdownEntry({
        id: "project-profile",
        title: "Project Profile",
        summary: `${input.projectName} 的项目画像、长期约束与当前阶段摘要。`,
        content: [
          `# Project Profile`,
          "",
          `- 项目：${input.projectName}`,
          `- 定位：${input.projectSummary}`,
          `- 当前阶段：${input.currentPhase}`,
          `- 核心关注：`,
          ...focusAreas.map((focus) => `  - ${focus}`),
          `- 长期约束：`,
          ...constraints.map((constraint) => `  - ${constraint}`),
          ...(risks.length > 0 ? [`- 当前风险：`, ...risks.map((risk) => `  - ${risk}`)] : []),
          ...(moduleHints.length > 0 ? [`- 模块提示：`, ...moduleHints.map((hint) => `  - ${hint}`)] : []),
          ...(host ? [`- 当前宿主：${host}`] : [])
        ].join("\n"),
        keywords: [
          input.projectName,
          input.currentPhase,
          ...focusAreas,
          ...constraints,
          ...moduleHints
        ],
        now
      })
    );

    await options.store.writeEntry(
      buildProjectMarkdownEntry({
        id: "current-focus",
        title: "Current Focus",
        summary: `${input.projectName} 当前迭代的重点、约束与近期关注项。`,
        content: [
          `# Current Focus`,
          "",
          ...focusAreas.map((focus) => `- ${focus}`),
          ...(constraints.length > 0 ? ["- 当前约束：", ...constraints.map((constraint) => `  - ${constraint}`)] : []),
          ...(risks.length > 0 ? ["- 当前风险：", ...risks.map((risk) => `  - ${risk}`)] : []),
          ...(moduleHints.length > 0 ? ["- 相关模块：", ...moduleHints.map((hint) => `  - ${hint}`)] : [])
        ].join("\n"),
        keywords: [input.projectName, ...focusAreas, ...constraints, ...moduleHints],
        now
      })
    );

    const graph = await options.store.readGraph();
    const nextGraph = buildProjectOnboardGraphSnapshot({
      graph,
      input: {
        ...input,
        focusAreas,
        constraints,
        risks,
        moduleHints
      },
      now
    });
    await options.store.writeGraph(nextGraph);

    return {
      status: "ok",
      payload: {
        humanReadable: summarizeText(
          `已完成项目画像初始化，更新了 project profile、current focus 与基础 graph。下一步建议先执行 /hippo:recall 验证召回是否对齐新的项目边界。`,
          260
        ),
        structured: {
          command: "/hippo:project-onboard",
          projectProfileUpdated: true,
          currentFocusUpdated: true,
          graphUpdated: true,
          projectName: input.projectName,
          currentPhase: input.currentPhase,
          focusAreas,
          moduleHints
        }
      },
      telemetry: {
        confidence: 0.86,
        exposureLevel: input.exposureLevel ?? "summary",
        dependencies: uniqueStrings([
          input.projectName,
          input.currentPhase,
          ...focusAreas,
          ...constraints,
          ...moduleHints
        ]),
        exposureTrace: [input.exposureLevel ?? "summary"],
        nextCommandHint: "/hippo:recall"
      }
    };
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

  async function executeDeepSleep(
    input: DeepSleepCommandInput
  ): Promise<CommandEnvelope<DeepSleepResult>> {
    const promotedLayers = uniqueStrings(
      input.candidateLayers.filter(isPromotableMemoryLayer)
    ) as Array<Extract<MemoryLayer, "decision" | "incident" | "pattern" | "module">>;
    const skippedReasons: string[] = [];

    if (promotedLayers.length === 0) {
      skippedReasons.push("没有可晋升的长期层候选。");
    }

    if (input.validation.length === 0) {
      skippedReasons.push("缺少验证结果，当前不满足长期沉淀条件。");
    }

    if ((input.signalStrength ?? "medium") === "low") {
      skippedReasons.push("signalStrength 为 low，当前不建议晋升。");
    }

    if (skippedReasons.length > 0) {
      return {
        status: "partial",
        payload: {
          humanReadable: summarizeText(
            `deep-sleep 暂未执行长期晋升。原因：${skippedReasons.join("；")} 建议先补充 validation 或重新运行 /hippo:sleep。`,
            260
          ),
          structured: {
            command: "/hippo:deep-sleep",
            summary: summarizeText(input.summary, 220),
            ...(input.sourceEpisodicId ? { sourceEpisodicId: input.sourceEpisodicId } : {}),
            promotedLayers: [],
            promotedEntryIds: [],
            graphUpdated: false,
            skippedReasons
          }
        },
        telemetry: {
          confidence: 0.46,
          exposureLevel: input.exposureLevel ?? "summary",
          dependencies: uniqueStrings(input.candidateLayers),
          exposureTrace: [input.exposureLevel ?? "summary"],
          nextCommandHint: "/hippo:sleep"
        }
      };
    }

    const promotedEntries = promotedLayers.map((layer) =>
      buildPromotedEntry({
        layer,
        input,
        now
      })
    );
    const writeResults = [];

    for (const entry of promotedEntries) {
      writeResults.push(await options.store.writeEntry(entry));
    }

    const sourceEntry = input.sourceEpisodicId
      ? await findEpisodicEntryById(options.store, input.sourceEpisodicId)
      : undefined;
    const graph = await options.store.readGraph();
    const nextGraph = buildDeepSleepGraphSnapshot({
      graph,
      ...(sourceEntry ? { sourceEntry } : {}),
      promotedEntries: writeResults.map((result) => result.entry),
      now
    });

    await options.store.writeGraph(nextGraph);

    return {
      status: "ok",
      payload: {
        humanReadable: summarizeText(
          `已完成 deep-sleep 晋升，新增 ${writeResults.length} 条长期记忆，并同步更新 associative graph。建议后续通过 /hippo:status 或 /hippo:recall 检查新记忆的可见性。`,
          260
        ),
        structured: {
          command: "/hippo:deep-sleep",
          summary: summarizeText(input.summary, 220),
          ...(input.sourceEpisodicId ? { sourceEpisodicId: input.sourceEpisodicId } : {}),
          promotedLayers,
          promotedEntryIds: writeResults.map((result) => result.entry.id),
          graphUpdated: true,
          skippedReasons: []
        }
      },
      telemetry: {
        confidence: 0.88,
        exposureLevel: input.exposureLevel ?? "summary",
        dependencies: uniqueStrings(writeResults.map((result) => result.entry.id)),
        exposureTrace: [input.exposureLevel ?? "summary"],
        nextCommandHint: "/hippo:status"
      }
    };
  }

  async function executeStatus(
    input: StatusCommandInput = {}
  ): Promise<CommandEnvelope<StatusResult>> {
    const entries = await options.store.queryEntries({
      includeArchived: input.includeArchived ?? false,
      exposureLevel: input.exposureLevel ?? "summary",
      limit: 2000
    });
    const graph = await options.store.readGraph();
    const layerSummary = summarizeLayers(entries);
    const episodicEntries = entries.filter((entry) => entry.layer === "episodic");
    const candidateBacklog = episodicEntries.filter(isCandidateEpisodicEntry).length;
    const promotableCandidates = episodicEntries.filter(isPromotableCandidateEntry).length;
    const recentLimit = Math.max(input.recentLimit ?? 5, 1);
    const recentEpisodicIds = episodicEntries.slice(0, recentLimit).map((entry) => entry.id);
    const healthSignals = buildStatusHealthSignals({
      graph,
      layerSummary,
      candidateBacklog,
      promotableCandidates
    });

    const structured: StatusResult = {
      command: "/hippo:status",
      totalEntries: entries.length,
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
      layerSummary,
      candidateBacklog,
      promotableCandidates,
      recentEpisodicIds,
      healthSignals
    };

    return {
      status: healthSignals.some((signal) => signal.level === "warning") ? "partial" : "ok",
      payload: {
        humanReadable: summarizeText(
          `当前记忆状态：共 ${entries.length} 条条目，graph ${graph.nodes.length} 个节点 / ${graph.edges.length} 条边，候选积压 ${candidateBacklog} 条，可晋升 ${promotableCandidates} 条。`,
          260
        ),
        structured
      },
      telemetry: {
        confidence: 0.83,
        exposureLevel: input.exposureLevel ?? "summary",
        dependencies: uniqueStrings([
          ...layerSummary.map((layer) => `${layer.layer}:${layer.entries}`),
          `graph:nodes:${graph.nodes.length}`,
          `graph:edges:${graph.edges.length}`
        ]),
        exposureTrace: [input.exposureLevel ?? "summary"],
        nextCommandHint: candidateBacklog > 0 ? "/hippo:deep-sleep" : "/hippo:recall"
      }
    };
  }

  async function executePrune(
    input: PruneCommandInput = {}
  ): Promise<CommandEnvelope<PruneResult>> {
    const entries = await options.store.queryEntries({
      includeArchived: input.includeArchived ?? false,
      exposureLevel: input.exposureLevel ?? "summary",
      limit: 2000
    });
    const graph = await options.store.readGraph();
    const limit = Math.max(input.limit ?? 10, 1);
    const suggestions = buildPruneSuggestions({
      entries,
      graph,
      now,
      minConfidence: input.minConfidence ?? 0.5,
      staleDays: input.staleDays ?? 30,
      episodicBacklogThreshold: input.episodicBacklogThreshold ?? 5
    }).slice(0, limit);

    const structured: PruneResult = {
      command: "/hippo:prune",
      readOnly: true,
      graphUnchanged: true,
      totalEntriesScanned: entries.length,
      graphNodesScanned: graph.nodes.length,
      graphEdgesScanned: graph.edges.length,
      suggestions
    };

    return {
      status: suggestions.length > 0 ? "ok" : "partial",
      payload: {
        humanReadable: summarizeText(
          suggestions.length > 0
            ? `已生成 ${suggestions.length} 条 prune 建议；当前为只读分析，不会直接删除记忆或改写 graph。建议先通过 /hippo:status 或 /hippo:recall 复核影响范围。`
            : "当前未发现明显需要 prune 的候选；建议继续通过 /hippo:status 观察积压，必要时再扩大暴露层复核。",
          260
        ),
        structured
      },
      telemetry: {
        confidence: suggestions.length > 0 ? 0.77 : 0.62,
        exposureLevel: input.exposureLevel ?? "summary",
        dependencies: uniqueStrings([
          `entries:${entries.length}`,
          `graph:nodes:${graph.nodes.length}`,
          `graph:edges:${graph.edges.length}`,
          ...suggestions.map((suggestion) => suggestion.targetId)
        ]),
        exposureTrace: [input.exposureLevel ?? "summary"],
        nextCommandHint: "/hippo:status"
      }
    };
  }

  async function executeCommand(
    command: HippoCommandName,
    input:
      | RecallCommandInput
      | ProjectOnboardCommandInput
      | ForecastCommandInput
      | ReflectCommandInput
      | SleepCommandInput
      | DeepSleepCommandInput
      | PruneCommandInput
      | StatusCommandInput
  ): Promise<
    | CommandEnvelope<RecallResult>
    | CommandEnvelope<ProjectOnboardResult>
    | CommandEnvelope<ForecastPlan>
    | CommandEnvelope<ReflectInsight>
    | CommandEnvelope<SleepEntry>
    | CommandEnvelope<DeepSleepResult>
    | CommandEnvelope<PruneResult>
    | CommandEnvelope<StatusResult>
  > {
    switch (command) {
      case "/hippo:recall":
        return executeRecall(input as RecallCommandInput);
      case "/hippo:project-onboard":
        return executeProjectOnboard(input as ProjectOnboardCommandInput);
      case "/hippo:forecast":
        return executeForecast(input as ForecastCommandInput);
      case "/hippo:reflect":
        return executeReflect(input as ReflectCommandInput);
      case "/hippo:sleep":
        return executeSleep(input as SleepCommandInput);
      case "/hippo:deep-sleep":
        return executeDeepSleep(input as DeepSleepCommandInput);
      case "/hippo:prune":
        return executePrune(input as PruneCommandInput);
      case "/hippo:status":
        return executeStatus(input as StatusCommandInput);
      default:
        throw new Error(`当前运行时尚未实现命令 ${command}`);
    }
  }

  return {
    executeRecall,
    executeProjectOnboard,
    executeForecast,
    executeReflect,
    executeSleep,
    executeDeepSleep,
    executePrune,
    executeStatus,
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

function buildProjectMarkdownEntry(options: {
  id: "project-profile" | "current-focus";
  title: string;
  summary: string;
  content: string;
  keywords: string[];
  now: () => Date;
}): MemoryEntry {
  return {
    id: options.id,
    layer: "project",
    title: options.title,
    summary: summarizeText(options.summary, 220),
    keywords: uniqueStrings(options.keywords.flatMap((value) => tokenizeText(value))),
    scope: options.id === "project-profile" ? "project" : "current-focus",
    exposure: "summary",
    content: options.content,
    createdAt: options.now().toISOString()
  };
}

function buildProjectOnboardGraphSnapshot(options: {
  graph: MemoryGraphSnapshot;
  input: ProjectOnboardCommandInput & {
    focusAreas: string[];
    constraints: string[];
    risks: string[];
    moduleHints: string[];
  };
  now: () => Date;
}): MemoryGraphSnapshot {
  const profileNode: MemoryGraphNode = {
    id: "project-profile",
    type: "project",
    title: "Project Profile",
    summary: summarizeText(
      `${options.input.projectName} 的项目画像，阶段 ${options.input.currentPhase}，聚焦 ${options.input.focusAreas.join("、") || "未指定"}。`,
      180
    ),
    keywords: uniqueStrings(
      tokenizeText(
        [
          options.input.projectName,
          options.input.projectSummary,
          options.input.currentPhase,
          ...options.input.focusAreas,
          ...options.input.constraints,
          ...options.input.moduleHints
        ].join(" ")
      )
    ),
    layer: "project",
    weight: 0.9,
    confidence: 0.85
  };
  const focusNode: MemoryGraphNode = {
    id: "current-focus",
    type: "project",
    title: "Current Focus",
    summary: summarizeText(
      `${options.input.projectName} 当前聚焦 ${options.input.focusAreas.join("、") || "未指定"}。`,
      180
    ),
    keywords: uniqueStrings(
      tokenizeText(
        [options.input.projectName, ...options.input.focusAreas, ...options.input.moduleHints].join(" ")
      )
    ),
    layer: "project",
    weight: 0.84,
    confidence: 0.81
  };

  const nextNodes = [...options.graph.nodes];
  upsertGraphNode(nextNodes, profileNode);
  upsertGraphNode(nextNodes, focusNode);

  const nextEdges = [...options.graph.edges];
  upsertGraphEdge(nextEdges, {
    from: "project-profile",
    to: "current-focus",
    type: "related_to",
    weight: 0.82,
    reason: "当前焦点直接继承项目画像、阶段与约束。"
  });

  return {
    version: options.graph.version,
    updatedAt: options.now().toISOString(),
    nodes: nextNodes,
    edges: nextEdges
  };
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

function summarizeLayers(entries: MemoryEntry[]): StatusResult["layerSummary"] {
  const counts = new Map<MemoryLayer, number>();

  for (const entry of entries) {
    counts.set(entry.layer, (counts.get(entry.layer) ?? 0) + 1);
  }

  return ["project", "decision", "incident", "pattern", "module", "episodic", "archive"].map(
    (layer) => ({
      layer: layer as MemoryLayer,
      entries: counts.get(layer as MemoryLayer) ?? 0
    })
  );
}

function isCandidateEpisodicEntry(entry: MemoryEntry): boolean {
  const command = readMetadataString(entry.metadata, "command");
  return command === "/hippo:reflect" || command === "/hippo:sleep";
}

function isPromotableCandidateEntry(entry: MemoryEntry): boolean {
  if (!isCandidateEpisodicEntry(entry)) {
    return false;
  }

  if (entry.metadata?.promoteToLongTerm === true) {
    return true;
  }

  return readMetadataStringArray(entry.metadata, "candidateLayers").some((layer) =>
    isPromotableMemoryLayer(layer as MemoryLayer)
  );
}

function buildStatusHealthSignals(input: {
  graph: MemoryGraphSnapshot;
  layerSummary: StatusResult["layerSummary"];
  candidateBacklog: number;
  promotableCandidates: number;
}): StatusResult["healthSignals"] {
  const signals: StatusResult["healthSignals"] = [];
  const episodicCount =
    input.layerSummary.find((summary) => summary.layer === "episodic")?.entries ?? 0;
  const longTermCount = input.layerSummary
    .filter((summary) =>
      ["decision", "incident", "pattern", "module"].includes(summary.layer)
    )
    .reduce((total, summary) => total + summary.entries, 0);

  if (input.graph.nodes.length === 0 || input.graph.edges.length === 0) {
    signals.push({ level: "warning", message: "associative graph 仍为空或边数不足。" });
  } else {
    signals.push({ level: "info", message: "associative graph 已建立基础关系。" });
  }

  if (longTermCount === 0) {
    signals.push({ level: "warning", message: "长期层尚无稳定记忆条目。" });
  } else {
    signals.push({ level: "info", message: `长期层当前共有 ${longTermCount} 条条目。` });
  }

  if (input.candidateBacklog >= 3) {
    signals.push({
      level: "warning",
      message: `episodic 候选积压 ${input.candidateBacklog} 条，建议整理 sleep / deep-sleep。`
    });
  } else if (episodicCount > 0) {
    signals.push({ level: "info", message: `episodic 当前有 ${episodicCount} 条最近记忆。` });
  }

  if (input.promotableCandidates > 0) {
    signals.push({
      level: "info",
      message: `存在 ${input.promotableCandidates} 条可晋升候选，可进一步执行 /hippo:deep-sleep。`
    });
  }

  if (signals.length === 0) {
    signals.push({ level: "warning", message: "当前状态信息不足，建议先执行 recall 或 sleep。" });
  }

  return signals;
}

function buildPruneSuggestions(input: {
  entries: MemoryEntry[];
  graph: MemoryGraphSnapshot;
  now: () => Date;
  minConfidence: number;
  staleDays: number;
  episodicBacklogThreshold: number;
}): PruneSuggestion[] {
  const suggestions: PruneSuggestion[] = [];
  const seen = new Set<string>();
  const staleThreshold = input.now().getTime() - Math.max(input.staleDays, 0) * 24 * 60 * 60 * 1000;
  const episodicEntries = input.entries.filter((entry) => entry.layer === "episodic");

  const pushSuggestion = (suggestion: PruneSuggestion) => {
    const key = `${suggestion.kind}:${suggestion.targetType}:${suggestion.targetId}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    suggestions.push(suggestion);
  };

  for (const entry of input.entries) {
    if (typeof entry.confidence === "number" && entry.confidence < input.minConfidence) {
      pushSuggestion({
        id: `prune-low-confidence-${entry.id}`,
        kind: "low-confidence",
        targetType: "entry",
        targetId: entry.id,
        layer: entry.layer,
        reason: `confidence=${entry.confidence.toFixed(2)} 低于阈值 ${input.minConfidence.toFixed(2)}。`,
        confidence: Math.max(0.55, Math.min(0.95, 1 - entry.confidence / Math.max(input.minConfidence, 0.01)))
      });
    }

    const lastUpdatedAt = Date.parse(entry.updatedAt ?? entry.createdAt);
    if (!Number.isNaN(lastUpdatedAt) && lastUpdatedAt < staleThreshold) {
      pushSuggestion({
        id: `prune-stale-${entry.id}`,
        kind: "stale-entry",
        targetType: "entry",
        targetId: entry.id,
        layer: entry.layer,
        reason: `条目超过 ${input.staleDays} 天未更新，建议复核是否仍应保留在当前层。`,
        confidence: 0.66
      });
    }

    if (entry.layer === "archive") {
      pushSuggestion({
        id: `prune-archive-${entry.id}`,
        kind: "archive-candidate",
        targetType: "entry",
        targetId: entry.id,
        layer: entry.layer,
        reason: "该条目已位于 archive 层，可复核是否继续保留。",
        confidence: 0.58
      });
    }
  }

  if (episodicEntries.length > input.episodicBacklogThreshold) {
    pushSuggestion({
      id: "prune-episodic-backlog",
      kind: "episodic-backlog",
      targetType: "layer",
      targetId: "episodic",
      layer: "episodic",
      reason: `episodic 积压 ${episodicEntries.length} 条，已超过阈值 ${input.episodicBacklogThreshold}。`,
      confidence: 0.81
    });
  }

  const nodeIdsInEdges = new Set(input.graph.edges.flatMap((edge) => [edge.from, edge.to]));
  for (const node of input.graph.nodes) {
    if (!nodeIdsInEdges.has(node.id)) {
      pushSuggestion({
        id: `prune-orphan-node-${node.id}`,
        kind: "orphan-graph-node",
        targetType: "graph-node",
        targetId: node.id,
        layer: node.layer,
        reason: "该 graph 节点没有任何边连接，建议复核是否仍有联想价值。",
        confidence: 0.72
      });
    }
  }

  return suggestions.sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.id.localeCompare(right.id);
  });
}

function readMetadataString(
  metadata: MemoryEntry["metadata"] | undefined,
  key: string
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function readMetadataStringArray(
  metadata: MemoryEntry["metadata"] | undefined,
  key: string
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

function isPromotableMemoryLayer(
  layer: MemoryLayer
): layer is Extract<MemoryLayer, "decision" | "incident" | "pattern" | "module"> {
  return ["decision", "incident", "pattern", "module"].includes(layer);
}

async function findEpisodicEntryById(
  store: MemoryStore,
  sourceEpisodicId: string
): Promise<MemoryEntry | undefined> {
  const entries = await store.queryEntries({
    layers: ["episodic"],
    includeArchived: true,
    exposureLevel: "full",
    limit: 1000
  });

  return entries.find((entry) => entry.id === sourceEpisodicId);
}

function buildPromotedEntry(options: {
  layer: Extract<MemoryLayer, "decision" | "incident" | "pattern" | "module">;
  input: DeepSleepCommandInput;
  now: () => Date;
}): MemoryEntry {
  const createdAt = options.now().toISOString();
  const id = createPromotedEntryId(options.layer, createdAt);
  const title = createPromotedEntryTitle(options.layer, options.input.summary);
  const references = uniqueStrings([
    ...(options.input.sourceEpisodicId ? [options.input.sourceEpisodicId] : []),
    ...options.input.touchedFiles
  ]);

  return {
    id,
    layer: options.layer,
    title,
    summary: summarizeText(options.input.summary, 220),
    keywords: uniqueStrings([
      ...tokenizeText(options.input.summary),
      ...(options.input.tags ?? []),
      ...options.input.validation.flatMap((item) => tokenizeText(item)),
      ...options.input.touchedFiles.flatMap((file) => tokenizeText(file)),
      options.layer
    ]).slice(0, 12),
    scope: buildPromotedEntryScope(options.input.touchedFiles),
    exposure: "summary",
    ...(references.length > 0 ? { references } : {}),
    createdAt,
    updatedAt: createdAt,
    confidence: options.input.signalStrength === "high" ? 0.9 : 0.76,
    metadata: {
      command: "/hippo:deep-sleep",
      sourceEpisodicId: options.input.sourceEpisodicId,
      candidateLayers: options.input.candidateLayers,
      touchedFiles: options.input.touchedFiles,
      validation: options.input.validation,
      tags: options.input.tags ?? [],
      signalStrength: options.input.signalStrength ?? "medium",
      promotedFrom: "episodic"
    },
    content: buildPromotedEntryContent(options.layer, options.input)
  };
}

function createPromotedEntryId(layer: MemoryLayer, createdAt: string): string {
  const normalizedDate = createdAt.slice(0, 10);
  const normalizedTime = createdAt.slice(11, 19).replace(/:/g, "");
  const prefix =
    layer === "decision"
      ? "D"
      : layer === "incident"
        ? "I"
        : layer === "pattern"
          ? "P"
          : "M";

  return `${prefix}-${normalizedDate}-${normalizedTime}`;
}

function createPromotedEntryTitle(layer: MemoryLayer, summary: string): string {
  const base = summarizeText(summary, 56);

  switch (layer) {
    case "decision":
      return `Deep Sleep Decision: ${base}`;
    case "incident":
      return `Deep Sleep Incident: ${base}`;
    case "pattern":
      return `Deep Sleep Pattern: ${base}`;
    case "module":
      return `Deep Sleep Module Note: ${base}`;
    default:
      return base;
  }
}

function buildPromotedEntryScope(touchedFiles: string[]): string {
  if (touchedFiles.length === 0) {
    return "deep-sleep";
  }

  return uniqueStrings(
    touchedFiles.map((file) => {
      const segments = file.split("/");
      return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : file;
    })
  ).join(", ");
}

function buildPromotedEntryContent(layer: MemoryLayer, input: DeepSleepCommandInput): string {
  const sectionLabel =
    layer === "decision"
      ? "Decision"
      : layer === "incident"
        ? "Incident"
        : layer === "pattern"
          ? "Pattern"
          : "Module";

  return [
    `## ${sectionLabel} Summary`,
    input.summary,
    "",
    "## Validation",
    input.validation.map((item) => `- ${item}`).join("\n") || "- none",
    "",
    "## Touched Files",
    input.touchedFiles.map((item) => `- ${item}`).join("\n") || "- none",
    "",
    "## Promotion Context",
    `- sourceEpisodicId: ${input.sourceEpisodicId ?? "none"}`,
    `- signalStrength: ${input.signalStrength ?? "medium"}`,
    `- candidateLayers: ${input.candidateLayers.join(", ")}`
  ].join("\n");
}

function buildDeepSleepGraphSnapshot(options: {
  graph: MemoryGraphSnapshot;
  sourceEntry?: MemoryEntry;
  promotedEntries: MemoryEntry[];
  now: () => Date;
}): MemoryGraphSnapshot {
  const nodes = [...options.graph.nodes];
  const edges = [...options.graph.edges];

  if (options.sourceEntry) {
    upsertGraphNode(nodes, memoryEntryToGraphNode(options.sourceEntry, 0.61));
  }

  for (const entry of options.promotedEntries) {
    upsertGraphNode(nodes, memoryEntryToGraphNode(entry, 0.83));

    if (options.sourceEntry) {
      upsertGraphEdge(edges, {
        from: options.sourceEntry.id,
        to: entry.id,
        type: "describes",
        weight: 0.74,
        reason: "deep-sleep promotion from episodic candidate"
      });
    }
  }

  return {
    version: options.graph.version,
    updatedAt: options.now().toISOString(),
    nodes,
    edges
  };
}

function memoryEntryToGraphNode(entry: MemoryEntry, weight: number): MemoryGraphNode {
  return {
    id: entry.id,
    type: entry.layer,
    title: entry.title,
    summary: entry.summary,
    keywords: entry.keywords,
    layer: entry.layer,
    weight,
    ...(typeof entry.confidence === "number" ? { confidence: entry.confidence } : {}),
    lastValidated: entry.updatedAt ?? entry.createdAt,
    ...(entry.metadata ? { metadata: entry.metadata } : {})
  };
}

function upsertGraphNode(nodes: MemoryGraphNode[], node: MemoryGraphNode): void {
  const index = nodes.findIndex((item) => item.id === node.id);

  if (index >= 0) {
    nodes[index] = node;
    return;
  }

  nodes.push(node);
}

function upsertGraphEdge(edges: MemoryGraphEdge[], edge: MemoryGraphEdge): void {
  const index = edges.findIndex(
    (item) => item.from === edge.from && item.to === edge.to && item.type === edge.type
  );

  if (index >= 0) {
    edges[index] = edge;
    return;
  }

  edges.push(edge);
}
