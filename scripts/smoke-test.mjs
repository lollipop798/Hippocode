#!/usr/bin/env node

import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkBuildArtifact(distEntryPath) {
  try {
    await access(distEntryPath, fsConstants.R_OK);
  } catch {
    throw new Error(
      [
        "未检测到构建产物 dist/index.js，smoke test 只针对已构建包执行。",
        "请先运行 `npm run build`，再执行 `npm run smoke`。"
      ].join("\n")
    );
  }
}

async function run() {
  const projectRoot = process.cwd();
  const distEntryPath = resolve(projectRoot, "dist/index.js");
  await checkBuildArtifact(distEntryPath);

  const pkg = await import(pathToFileURL(distEntryPath).href);
  const { createFileMemoryStore, createHippoRuntime } = pkg;

  assert(
    typeof createFileMemoryStore === "function" && typeof createHippoRuntime === "function",
    "dist 导出缺少 createFileMemoryStore 或 createHippoRuntime。"
  );

  const tempRoot = await mkdtemp(join(tmpdir(), "hippocode-smoke-"));
  const memoryRoot = join(tempRoot, ".memory");

  try {
    const store = createFileMemoryStore({ rootDir: memoryRoot });
    const runtime = createHippoRuntime({ store });

    await store.writeEntry({
      id: "smoke-module-entry",
      layer: "module",
      title: "Smoke Module Entry",
      summary: "用于验证 recall happy path 的最小样例。",
      keywords: ["smoke", "recall", "runtime"],
      scope: "module",
      exposure: "summary",
      content: "smoke recall runtime sample",
      createdAt: new Date().toISOString()
    });

    const recall = await runtime.executeRecall({
      prompt: "请回忆 smoke runtime recall",
      intent: "smoke-test",
      scope: "task",
      limit: 5
    });

    assert(recall.status !== "error", "recall 返回 error。");
    assert(recall.payload.structured.command === "/hippo:recall", "recall 返回命令类型不正确。");
    assert(
      recall.payload.structured.matches.length > 0,
      "recall 未命中任何记忆条目，未通过 happy path。"
    );

    const sleep = await runtime.executeSleep({
      summary: "smoke test 验证 recall/sleep 最小流程通过",
      touchedFiles: ["src/core/runtime.ts", "scripts/smoke-test.mjs"],
      validation: ["recall-ok", "sleep-ok"],
      tags: ["smoke", "test"],
      signalStrength: "medium"
    });

    assert(sleep.status === "ok", "sleep 未返回 ok。");
    assert(sleep.payload.structured.command === "/hippo:sleep", "sleep 返回命令类型不正确。");
    assert(
      sleep.payload.structured.candidateLayers.includes("episodic"),
      "sleep 候选层未包含 episodic。"
    );

    const episodicDir = join(memoryRoot, "episodic");
    const episodicFiles = await readdir(episodicDir);
    assert(episodicFiles.length > 0, "sleep 未写入 episodic 目录。");

    console.log("Hippocode smoke test passed.");
    console.log(`Recall matches: ${recall.payload.structured.matches.length}`);
    console.log(`Sleep entry id: ${sleep.payload.structured.episodicEntryId ?? "n/a"}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Hippocode smoke test failed:\n${message}`);
  process.exitCode = 1;
});
