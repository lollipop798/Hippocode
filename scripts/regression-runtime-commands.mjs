#!/usr/bin/env node

import { access, cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertReadable(path, label) {
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    throw new Error(`缺少 ${label}: ${path}`);
  }
}

function createFixedNow() {
  return () => new Date("2026-04-13T14:00:00.000Z");
}

async function loadRuntime(projectRoot) {
  const distEntryPath = resolve(projectRoot, "dist/index.js");
  await assertReadable(distEntryPath, "构建产物 dist/index.js");

  const pkg = await import(pathToFileURL(distEntryPath).href);
  const { createFileMemoryStore, createHippoRuntime } = pkg;

  assert(
    typeof createFileMemoryStore === "function" && typeof createHippoRuntime === "function",
    "dist 导出缺少 createFileMemoryStore 或 createHippoRuntime。"
  );

  return { createFileMemoryStore, createHippoRuntime };
}

async function createIsolatedMemoryRoot(projectRoot, fixtureName) {
  const sourceRoot = resolve(projectRoot, `fixtures/${fixtureName}/.memory`);
  await assertReadable(sourceRoot, `${fixtureName} fixture 根目录`);

  const tempRoot = await mkdtemp(join(tmpdir(), `hippocode-${fixtureName}-`));
  const targetRoot = join(tempRoot, ".memory");
  await cp(sourceRoot, targetRoot, { recursive: true });

  return {
    tempRoot,
    memoryRoot: targetRoot
  };
}

function assertTelemetry(response, expectedLevel, expectedTrace, expectedNextCommandHint) {
  assert(response.telemetry.exposureLevel === expectedLevel, `exposureLevel 期望 ${expectedLevel}，实际 ${response.telemetry.exposureLevel}`);
  assert(
    JSON.stringify(response.telemetry.exposureTrace) === JSON.stringify(expectedTrace),
    `exposureTrace 期望 ${JSON.stringify(expectedTrace)}，实际 ${JSON.stringify(response.telemetry.exposureTrace)}`
  );
  assert(
    response.telemetry.nextCommandHint === expectedNextCommandHint,
    `nextCommandHint 期望 ${expectedNextCommandHint}，实际 ${response.telemetry.nextCommandHint}`
  );
}

async function runForecastRegression(projectRoot, runtimeFactory) {
  const { tempRoot, memoryRoot } = await createIsolatedMemoryRoot(projectRoot, "forecast-regression");

  try {
    const now = createFixedNow();
    const store = runtimeFactory.createFileMemoryStore({ rootDir: memoryRoot, now });
    const runtime = runtimeFactory.createHippoRuntime({ store, now });

    const response = await runtime.executeForecast({
      taskDescription: "stabilize runtime recall planning regression",
      constraints: ["summary-first", "package-first"],
      targetExposure: "focused"
    });

    assert(response.status !== "error", "forecast regression 返回 error。");
    assert(response.payload.structured.command === "/hippo:forecast", "forecast command 不正确。");
    assert(response.payload.structured.steps.length === 3, `forecast steps 期望 3，实际 ${response.payload.structured.steps.length}`);
    assert(
      response.payload.structured.followUpCommands.includes("/hippo:reflect") &&
        response.payload.structured.followUpCommands.includes("/hippo:sleep"),
      "forecast followUpCommands 缺少 reflect/sleep。"
    );
    assert(
      typeof response.payload.structured.recommendedFocusPath === "string" &&
        response.payload.structured.recommendedFocusPath.length > 0,
      "forecast 未返回 recommendedFocusPath。"
    );
    assert(response.telemetry.dependencies.length > 0, "forecast telemetry.dependencies 为空。");
    assertTelemetry(response, "focused", ["focused"], "/hippo:reflect");

    return {
      steps: response.payload.structured.steps.length,
      recommendedFocusPath: response.payload.structured.recommendedFocusPath
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runReflectRegression(projectRoot, runtimeFactory) {
  const { tempRoot, memoryRoot } = await createIsolatedMemoryRoot(projectRoot, "reflect-regression");

  try {
    const now = createFixedNow();
    const store = runtimeFactory.createFileMemoryStore({ rootDir: memoryRoot, now });
    const runtime = runtimeFactory.createHippoRuntime({ store, now });
    const episodicDir = join(memoryRoot, "episodic");
    const beforeFiles = await readdir(episodicDir);

    const priorForecast = {
      command: "/hippo:forecast",
      goal: "stabilize reflect contract",
      assumptions: ["已有 recall baseline"],
      constraints: ["summary-first"],
      recommendedFocusPath: "src/core/runtime.ts",
      steps: [
        {
          title: "确认约束与焦点",
          rationale: "先对齐约束",
          validation: ["确认 recall baseline"],
          riskLevel: "medium"
        },
        {
          title: "沿最小改动路径推进",
          rationale: "避免过度扩散",
          validation: ["限定改动边界"],
          riskLevel: "medium"
        }
      ],
      followUpCommands: ["/hippo:reflect", "/hippo:sleep"]
    };

    const response = await runtime.executeReflect({
      sessionEvents: [
        "确认约束与焦点 pass",
        "validation pass",
        "runtime signal fail",
        "记录 done"
      ],
      outcome: "本轮修正了 runtime 回归脚本，但发现 validation 覆盖仍有缺口。",
      anomalies: ["遗漏一项 validation 断言"],
      lessons: ["先固定 fixture 再扩展脚本"],
      timeRange: "2026-04-13T13:30:00.000Z/2026-04-13T14:00:00.000Z",
      priorForecast
    });

    const afterFiles = await readdir(episodicDir);

    assert(response.status === "ok", "reflect regression 未返回 ok。");
    assert(response.payload.structured.command === "/hippo:reflect", "reflect command 不正确。");
    assert(response.payload.structured.deviations.length > 0, "reflect deviations 为空。");
    assert(response.payload.structured.confirmedSignals.length > 0, "reflect confirmedSignals 为空。");
    assert(response.payload.structured.misleadingSignals.length > 0, "reflect misleadingSignals 为空。");
    assert(
      response.payload.structured.candidateLayers?.includes("episodic") &&
        response.payload.structured.candidateLayers?.includes("incident") &&
        response.payload.structured.candidateLayers?.includes("pattern") &&
        response.payload.structured.candidateLayers?.includes("decision"),
      "reflect candidateLayers 未覆盖 episodic/incident/pattern/decision。"
    );
    assert(afterFiles.length === beforeFiles.length + 1, "reflect 未新增 episodic 条目。");
    assert(
      typeof response.payload.structured.episodicEntryId === "string" &&
        response.payload.structured.episodicEntryId.length > 0,
      "reflect 未返回 episodicEntryId。"
    );
    assertTelemetry(response, "summary", ["summary"], "/hippo:sleep");

    return {
      deviations: response.payload.structured.deviations.length,
      episodicEntryId: response.payload.structured.episodicEntryId
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runSleepRegression(projectRoot, runtimeFactory) {
  const { tempRoot, memoryRoot } = await createIsolatedMemoryRoot(projectRoot, "sleep-regression");

  try {
    const now = createFixedNow();
    const store = runtimeFactory.createFileMemoryStore({ rootDir: memoryRoot, now });
    const runtime = runtimeFactory.createHippoRuntime({ store, now });
    const episodicDir = join(memoryRoot, "episodic");
    const beforeFiles = await readdir(episodicDir);

    const response = await runtime.executeSleep({
      summary: "runtime regression decision candidate should be compressed for deep sleep",
      touchedFiles: ["src/core/runtime.ts", "src/core/memory-store.ts"],
      validation: ["build-pass", "regression-pass"],
      tags: ["pattern", "workflow", "test"],
      exposureLevel: "focused",
      signalStrength: "high"
    });

    const afterFiles = await readdir(episodicDir);

    assert(response.status === "ok", "sleep regression 未返回 ok。");
    assert(response.payload.structured.command === "/hippo:sleep", "sleep command 不正确。");
    assert(response.payload.structured.promoteToLongTerm === true, "sleep 未建议晋升长期层。");
    assert(afterFiles.length === beforeFiles.length + 1, "sleep 未新增 episodic 条目。");

    const layers = response.payload.structured.candidateLayers;
    for (const expectedLayer of ["episodic", "incident", "decision", "module", "pattern"]) {
      assert(layers.includes(expectedLayer), `sleep candidateLayers 缺少 ${expectedLayer}。`);
    }

    assertTelemetry(response, "focused", ["focused"], "/hippo:deep-sleep");

    return {
      candidateLayers: layers.length,
      promoteToLongTerm: response.payload.structured.promoteToLongTerm
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function countLayerFiles(memoryRoot, layerDirectory) {
  const entries = await readdir(join(memoryRoot, layerDirectory));
  return entries.filter((name) => name !== "README.md").length;
}

async function runDeepSleepRegression(projectRoot, runtimeFactory) {
  const { tempRoot, memoryRoot } = await createIsolatedMemoryRoot(projectRoot, "sleep-regression");

  try {
    const now = createFixedNow();
    const store = runtimeFactory.createFileMemoryStore({ rootDir: memoryRoot, now });
    const runtime = runtimeFactory.createHippoRuntime({ store, now });
    const graphBefore = await store.readGraph();
    const beforeDecisionCount = await countLayerFiles(memoryRoot, "decisions");
    const beforeIncidentCount = await countLayerFiles(memoryRoot, "incidents");
    const beforePatternCount = await countLayerFiles(memoryRoot, "patterns");
    const beforeModuleCount = await countLayerFiles(memoryRoot, "modules");

    const sleepResponse = await runtime.executeSleep({
      summary: "runtime regression decision candidate should be compressed for deep sleep",
      touchedFiles: ["src/core/runtime.ts", "src/core/memory-store.ts"],
      validation: ["build-pass", "regression-pass"],
      tags: ["pattern", "workflow", "test"],
      exposureLevel: "focused",
      signalStrength: "high"
    });

    const response = await runtime.executeDeepSleep({
      summary: sleepResponse.payload.structured.summary,
      touchedFiles: sleepResponse.payload.structured.touchedFiles,
      validation: sleepResponse.payload.structured.validation,
      candidateLayers: sleepResponse.payload.structured.candidateLayers,
      sourceEpisodicId: sleepResponse.payload.structured.episodicEntryId,
      tags: ["pattern", "workflow", "test"],
      exposureLevel: "focused",
      signalStrength: "high"
    });

    const graphAfter = await store.readGraph();
    const afterDecisionCount = await countLayerFiles(memoryRoot, "decisions");
    const afterIncidentCount = await countLayerFiles(memoryRoot, "incidents");
    const afterPatternCount = await countLayerFiles(memoryRoot, "patterns");
    const afterModuleCount = await countLayerFiles(memoryRoot, "modules");

    assert(response.status === "ok", "deep-sleep regression 未返回 ok。");
    assert(response.payload.structured.command === "/hippo:deep-sleep", "deep-sleep command 不正确。");
    assert(response.payload.structured.graphUpdated === true, "deep-sleep 未更新 graph。");
    assert(response.payload.structured.promotedEntryIds.length === 4, "deep-sleep 晋升条目数量不正确。");

    const promotedLayers = response.payload.structured.promotedLayers;
    for (const expectedLayer of ["decision", "incident", "module", "pattern"]) {
      assert(promotedLayers.includes(expectedLayer), `deep-sleep promotedLayers 缺少 ${expectedLayer}。`);
    }

    assert(afterDecisionCount === beforeDecisionCount + 1, "deep-sleep 未新增 decision 条目。");
    assert(afterIncidentCount === beforeIncidentCount + 1, "deep-sleep 未新增 incident 条目。");
    assert(afterPatternCount === beforePatternCount + 1, "deep-sleep 未新增 pattern 条目。");
    assert(afterModuleCount === beforeModuleCount + 1, "deep-sleep 未新增 module 条目。");
    assert(graphAfter.nodes.length >= graphBefore.nodes.length + 4, "deep-sleep graph nodes 未按预期增长。");
    assert(graphAfter.edges.length >= graphBefore.edges.length + 4, "deep-sleep graph edges 未按预期增长。");
    assertTelemetry(response, "focused", ["focused"], "/hippo:status");

    return {
      promotedEntries: response.payload.structured.promotedEntryIds.length,
      graphNodes: graphAfter.nodes.length,
      graphEdges: graphAfter.edges.length
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function run() {
  const projectRoot = process.cwd();
  const mode = process.argv[2] ?? "all";
  const runtimeFactory = await loadRuntime(projectRoot);

  const selectedModes = mode === "all" ? ["forecast", "reflect", "sleep", "deep-sleep"] : [mode];
  const results = [];

  for (const selectedMode of selectedModes) {
    if (selectedMode === "forecast") {
      results.push(["forecast", await runForecastRegression(projectRoot, runtimeFactory)]);
      continue;
    }

    if (selectedMode === "reflect") {
      results.push(["reflect", await runReflectRegression(projectRoot, runtimeFactory)]);
      continue;
    }

    if (selectedMode === "sleep") {
      results.push(["sleep", await runSleepRegression(projectRoot, runtimeFactory)]);
      continue;
    }

    if (selectedMode === "deep-sleep") {
      results.push(["deep-sleep", await runDeepSleepRegression(projectRoot, runtimeFactory)]);
      continue;
    }

    throw new Error(`不支持的 regression 模式: ${selectedMode}`);
  }

  console.log("Runtime command regression passed.");

  for (const [name, summary] of results) {
    console.log(`${name}: ${JSON.stringify(summary)}`);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Runtime command regression failed:\n${message}`);
  process.exitCode = 1;
});
