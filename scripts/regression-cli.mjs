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
  const deepSleep = await runDeepSleepRegression(projectRoot);

  console.log("CLI regression passed.");
  console.log(`validate: ${JSON.stringify(validate)}`);
  console.log(`recall: ${JSON.stringify(recall)}`);
  console.log(`deep-sleep: ${JSON.stringify(deepSleep)}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI regression failed:\n${message}`);
  process.exitCode = 1;
});
