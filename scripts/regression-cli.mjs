#!/usr/bin/env node

import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

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

async function runCli(projectRoot, args) {
  const cliEntryPath = resolve(projectRoot, "dist/cli/bin.js");
  await assertReadable(cliEntryPath, "CLI 构建产物 dist/cli/bin.js");

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliEntryPath, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr
      });
    });
  });
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(
      `${label} 未返回合法 JSON。\nstdout:\n${output}\nerror:\n${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function runValidateRegression(projectRoot) {
  const response = await runCli(projectRoot, [
    "validate",
    "--memory-root",
    "fixtures/recall-regression/.memory",
    "--json"
  ]);

  assert(response.code === 0, `validate CLI 退出码异常：${response.code}\n${response.stderr}`);
  const payload = parseJsonOutput(response.stdout, "validate CLI");
  assert(payload.command === "validate", "validate CLI command 不正确。");
  assert(payload.entries === 6, `validate CLI entries 期望 6，实际 ${payload.entries}`);
  assert(payload.graphNodes === 6, `validate CLI graphNodes 期望 6，实际 ${payload.graphNodes}`);
  assert(payload.graphEdges === 5, `validate CLI graphEdges 期望 5，实际 ${payload.graphEdges}`);

  return {
    entries: payload.entries,
    graphNodes: payload.graphNodes,
    graphEdges: payload.graphEdges
  };
}

async function runRecallRegression(projectRoot) {
  const response = await runCli(projectRoot, [
    "recall",
    "--memory-root",
    "fixtures/recall-regression/.memory",
    "--prompt",
    "runtime risk regression",
    "--scope",
    "task",
    "--json"
  ]);

  assert(response.code === 0, `recall CLI 退出码异常：${response.code}\n${response.stderr}`);
  const payload = parseJsonOutput(response.stdout, "recall CLI");
  assert(payload.status === "ok", `recall CLI status 期望 ok，实际 ${payload.status}`);
  assert(payload.payload?.structured?.command === "/hippo:recall", "recall CLI command 不正确。");
  assert(
    Array.isArray(payload.payload?.structured?.matches) && payload.payload.structured.matches.length >= 2,
    "recall CLI 未返回足够的 matches。"
  );
  assert(
    payload.telemetry?.nextCommandHint === "/hippo:forecast",
    `recall CLI nextCommandHint 期望 /hippo:forecast，实际 ${payload.telemetry?.nextCommandHint}`
  );

  return {
    matches: payload.payload.structured.matches.length,
    nextCommandHint: payload.telemetry.nextCommandHint
  };
}

async function runForecastRegression(projectRoot) {
  const response = await runCli(projectRoot, [
    "forecast",
    "--memory-root",
    "fixtures/forecast-regression/.memory",
    "--task",
    "stabilize runtime recall planning regression",
    "--constraint",
    "summary-first",
    "--constraint",
    "package-first",
    "--exposure",
    "focused",
    "--json"
  ]);

  assert(response.code === 0, `forecast CLI 退出码异常：${response.code}\n${response.stderr}`);
  const payload = parseJsonOutput(response.stdout, "forecast CLI");
  assert(payload.status === "ok", `forecast CLI status 期望 ok，实际 ${payload.status}`);
  assert(payload.payload?.structured?.command === "/hippo:forecast", "forecast CLI command 不正确。");
  assert(
    Array.isArray(payload.payload?.structured?.steps) && payload.payload.structured.steps.length === 3,
    `forecast CLI steps 期望 3，实际 ${payload.payload?.structured?.steps?.length}`
  );
  assert(
    payload.telemetry?.nextCommandHint === "/hippo:reflect",
    `forecast CLI nextCommandHint 期望 /hippo:reflect，实际 ${payload.telemetry?.nextCommandHint}`
  );

  return {
    steps: payload.payload.structured.steps.length,
    nextCommandHint: payload.telemetry.nextCommandHint
  };
}

async function runReflectRegression(projectRoot) {
  const tempRoot = await mkdtemp(join(tmpdir(), "hippocode-cli-reflect-"));

  try {
    const memoryRoot = join(tempRoot, ".memory");
    await cp(resolve(projectRoot, "fixtures/reflect-regression/.memory"), memoryRoot, {
      recursive: true
    });

    const response = await runCli(projectRoot, [
      "reflect",
      "--memory-root",
      memoryRoot,
      "--session-event",
      "确认约束与焦点 pass",
      "--session-event",
      "validation pass",
      "--session-event",
      "runtime signal fail",
      "--outcome",
      "本轮修正了 runtime 回归脚本，但发现 validation 覆盖仍有缺口。",
      "--anomaly",
      "遗漏一项 validation 断言",
      "--lesson",
      "先固定 fixture 再扩展脚本",
      "--time-range",
      "2026-04-13T13:30:00.000Z/2026-04-13T14:00:00.000Z",
      "--json"
    ]);

    assert(response.code === 0, `reflect CLI 退出码异常：${response.code}\n${response.stderr}`);
    const payload = parseJsonOutput(response.stdout, "reflect CLI");
    assert(payload.status === "ok", `reflect CLI status 期望 ok，实际 ${payload.status}`);
    assert(payload.payload?.structured?.command === "/hippo:reflect", "reflect CLI command 不正确。");
    assert(
      Array.isArray(payload.payload?.structured?.deviations) &&
        payload.payload.structured.deviations.length > 0,
      "reflect CLI deviations 为空。"
    );
    assert(
      payload.telemetry?.nextCommandHint === "/hippo:sleep",
      `reflect CLI nextCommandHint 期望 /hippo:sleep，实际 ${payload.telemetry?.nextCommandHint}`
    );

    return {
      deviations: payload.payload.structured.deviations.length,
      nextCommandHint: payload.telemetry.nextCommandHint
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runSleepRegression(projectRoot) {
  const tempRoot = await mkdtemp(join(tmpdir(), "hippocode-cli-sleep-"));

  try {
    const memoryRoot = join(tempRoot, ".memory");
    await cp(resolve(projectRoot, "fixtures/sleep-regression/.memory"), memoryRoot, {
      recursive: true
    });

    const response = await runCli(projectRoot, [
      "sleep",
      "--memory-root",
      memoryRoot,
      "--summary",
      "runtime regression decision candidate should be compressed for deep sleep",
      "--touched-file",
      "src/core/runtime.ts",
      "--touched-file",
      "src/core/memory-store.ts",
      "--validation",
      "build-pass",
      "--validation",
      "regression-pass",
      "--tag",
      "pattern",
      "--tag",
      "workflow",
      "--tag",
      "test",
      "--exposure",
      "focused",
      "--signal-strength",
      "high",
      "--json"
    ]);

    assert(response.code === 0, `sleep CLI 退出码异常：${response.code}\n${response.stderr}`);
    const payload = parseJsonOutput(response.stdout, "sleep CLI");
    assert(payload.status === "ok", `sleep CLI status 期望 ok，实际 ${payload.status}`);
    assert(payload.payload?.structured?.command === "/hippo:sleep", "sleep CLI command 不正确。");
    assert(
      payload.payload?.structured?.promoteToLongTerm === true,
      "sleep CLI 未建议晋升长期层。"
    );
    assert(
      payload.telemetry?.nextCommandHint === "/hippo:deep-sleep",
      `sleep CLI nextCommandHint 期望 /hippo:deep-sleep，实际 ${payload.telemetry?.nextCommandHint}`
    );

    return {
      candidateLayers: payload.payload.structured.candidateLayers.length,
      nextCommandHint: payload.telemetry.nextCommandHint
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runDeepSleepRegression(projectRoot) {
  const tempRoot = await mkdtemp(join(tmpdir(), "hippocode-cli-regression-"));

  try {
    const memoryRoot = join(tempRoot, ".memory");
    await cp(resolve(projectRoot, "fixtures/sleep-regression/.memory"), memoryRoot, {
      recursive: true
    });

    const response = await runCli(projectRoot, [
      "deep-sleep",
      "--memory-root",
      memoryRoot,
      "--summary",
      "promote tested runtime knowledge",
      "--candidate-layer",
      "decision",
      "--candidate-layer",
      "pattern",
      "--validation",
      "build-pass",
      "--validation",
      "regression-pass",
      "--touched-file",
      "src/core/runtime.ts",
      "--signal-strength",
      "high",
      "--json"
    ]);

    assert(response.code === 0, `deep-sleep CLI 退出码异常：${response.code}\n${response.stderr}`);
    const payload = parseJsonOutput(response.stdout, "deep-sleep CLI");
    assert(payload.status === "ok", `deep-sleep CLI status 期望 ok，实际 ${payload.status}`);
    assert(
      payload.payload?.structured?.command === "/hippo:deep-sleep",
      "deep-sleep CLI command 不正确。"
    );
    assert(
      payload.payload?.structured?.graphUpdated === true,
      "deep-sleep CLI 未更新 graph。"
    );
    assert(
      Array.isArray(payload.payload?.structured?.promotedLayers) &&
        payload.payload.structured.promotedLayers.includes("decision") &&
        payload.payload.structured.promotedLayers.includes("pattern"),
      "deep-sleep CLI 未返回 decision/pattern 晋升结果。"
    );

    return {
      promotedLayers: payload.payload.structured.promotedLayers.length,
      graphUpdated: payload.payload.structured.graphUpdated
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function run() {
  const projectRoot = process.cwd();
  const validate = await runValidateRegression(projectRoot);
  const recall = await runRecallRegression(projectRoot);
  const forecast = await runForecastRegression(projectRoot);
  const reflect = await runReflectRegression(projectRoot);
  const sleep = await runSleepRegression(projectRoot);
  const deepSleep = await runDeepSleepRegression(projectRoot);

  console.log("CLI regression passed.");
  console.log(`validate: ${JSON.stringify(validate)}`);
  console.log(`recall: ${JSON.stringify(recall)}`);
  console.log(`forecast: ${JSON.stringify(forecast)}`);
  console.log(`reflect: ${JSON.stringify(reflect)}`);
  console.log(`sleep: ${JSON.stringify(sleep)}`);
  console.log(`deep-sleep: ${JSON.stringify(deepSleep)}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI regression failed:\n${message}`);
  process.exitCode = 1;
});
