#!/usr/bin/env node

import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
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

async function checkPrerequisites(projectRoot) {
  const distEntryPath = resolve(projectRoot, "dist/index.js");
  const memoryRoot = resolve(projectRoot, "fixtures/recall-regression/.memory");
  const incidentFixture = resolve(
    projectRoot,
    "fixtures/recall-regression/.memory/incidents/2026-04-13-runtime-regression.json"
  );
  const moduleFixture = resolve(
    projectRoot,
    "fixtures/recall-regression/.memory/modules/2026-04-13-runtime-recall-boundary.json"
  );

  await assertReadable(distEntryPath, "构建产物 dist/index.js");
  await assertReadable(memoryRoot, "fixture 根目录 .memory");
  await assertReadable(incidentFixture, "incident fixture");
  await assertReadable(moduleFixture, "module fixture");
}

function assertExposure(response, expectedLevel, expectedTrace) {
  const telemetry = response.telemetry;
  assert(telemetry.exposureLevel === expectedLevel, `exposureLevel 期望 ${expectedLevel}，实际 ${telemetry.exposureLevel}`);
  assert(
    JSON.stringify(telemetry.exposureTrace) === JSON.stringify(expectedTrace),
    `exposureTrace 期望 ${JSON.stringify(expectedTrace)}，实际 ${JSON.stringify(telemetry.exposureTrace)}`
  );
}

function assertIncidentRankedBeforeModule(matches) {
  const incidentIndex = matches.findIndex((match) => match.entry.layer === "incident");
  const moduleIndex = matches.findIndex((match) => match.entry.layer === "module");

  assert(incidentIndex >= 0, "未命中 incident 条目，无法验证 incident 优先级。");
  assert(moduleIndex >= 0, "未命中 module 条目，无法验证 incident 优先级。");
  assert(
    incidentIndex < moduleIndex,
    `排序回归：incident 应排在 module 前，实际 incidentIndex=${incidentIndex}, moduleIndex=${moduleIndex}`
  );
}

async function run() {
  const projectRoot = process.cwd();
  await checkPrerequisites(projectRoot);

  const distEntryPath = resolve(projectRoot, "dist/index.js");
  const memoryRoot = resolve(projectRoot, "fixtures/recall-regression/.memory");
  const { createFileMemoryStore, createHippoRuntime } = await import(pathToFileURL(distEntryPath).href);

  assert(
    typeof createFileMemoryStore === "function" && typeof createHippoRuntime === "function",
    "dist 导出缺少 createFileMemoryStore 或 createHippoRuntime。"
  );

  const store = createFileMemoryStore({ rootDir: memoryRoot });
  const runtime = createHippoRuntime({ store });

  const rankingPrompt = "memory store recursion initialization sleep runtime";

  const summaryRecall = await runtime.executeRecall({
    prompt: rankingPrompt,
    intent: "regression-recall-ranking",
    scope: "task",
    limit: 10
  });
  assert(summaryRecall.status !== "error", "summary recall 返回 error。");
  assertExposure(summaryRecall, "summary", ["summary"]);
  assertIncidentRankedBeforeModule(summaryRecall.payload.structured.matches);

  const focusedRecall = await runtime.executeRecall({
    prompt: "runtime recall boundary",
    intent: "regression-focus-path",
    scope: "task",
    focusPath: "recall-engine",
    limit: 10
  });
  assert(focusedRecall.status !== "error", "focused recall 返回 error。");
  assertExposure(focusedRecall, "focused", ["summary", "focused"]);

  const fullRecall = await runtime.executeRecall({
    prompt: "runtime recall boundary",
    intent: "regression-full-exposure",
    scope: "task",
    exposureLevel: "full",
    limit: 10
  });
  assert(fullRecall.status !== "error", "full recall 返回 error。");
  assertExposure(fullRecall, "full", ["summary", "full"]);

  console.log("Recall regression passed.");
  console.log(`Summary matches: ${summaryRecall.payload.structured.matches.length}`);
  console.log(`Focused trace: ${focusedRecall.telemetry.exposureTrace.join(" -> ")}`);
  console.log(`Full trace: ${fullRecall.telemetry.exposureTrace.join(" -> ")}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Recall regression failed:\n${message}`);
  process.exitCode = 1;
});
