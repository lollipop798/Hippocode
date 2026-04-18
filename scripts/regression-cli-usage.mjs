#!/usr/bin/env node

import { access, mkdtemp, rm } from "node:fs/promises";
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

function assertUsageCommon(response, label) {
  assert(response.code === 2, `${label} 退出码应为 2，实际 ${response.code}\n${response.stderr}`);
  assert(response.stderr.includes("Hippocode CLI"), `${label} stderr 缺少 Hippocode CLI 帮助头。`);
  assert(response.stderr.includes("用法："), `${label} stderr 缺少用法段落。`);
}

async function assertUsageError(projectRoot, testCase) {
  const response = await runCli(projectRoot, testCase.args);
  assertUsageCommon(response, testCase.label);
  for (const keyword of testCase.keywords) {
    assert(
      response.stderr.includes(keyword),
      `${testCase.label} stderr 缺少关键字 ${keyword}。\nstderr:\n${response.stderr}`
    );
  }
}

async function runSuccessSmoke(projectRoot) {
  const response = await runCli(projectRoot, ["commands"]);
  assert(response.code === 0, `commands smoke 退出码异常：${response.code}\n${response.stderr}`);
  assert(response.stdout.includes("已实现命令"), "commands smoke 输出缺少“已实现命令”。");
  assert(response.stdout.includes("/hippo:recall"), "commands smoke 输出缺少 /hippo:recall。\n");
  return {
    command: "commands",
    outputLines: response.stdout.trim().split("\n").length
  };
}

async function detectInitCommand(projectRoot) {
  const help = await runCli(projectRoot, ["help"]);
  assert(help.code === 0, `help 命令退出码异常：${help.code}\n${help.stderr}`);
  return help.stdout.includes("hippocode init");
}

async function runOptionalInitUsageRegression(projectRoot) {
  const supported = await detectInitCommand(projectRoot);
  if (!supported) {
    return {
      enabled: false,
      reason: "当前 CLI 未暴露 init 子命令"
    };
  }

  const tempRoot = await mkdtemp(join(tmpdir(), "hippocode-cli-init-usage-"));

  try {
    const cases = [
      {
        label: "init 缺少 target 值",
        args: ["init", "--target"],
        keywords: ["--target", "目标路径"]
      },
      {
        label: "init 非法 host",
        args: ["init", "--target", tempRoot, "--host", "invalid-host"],
        keywords: ["--host", "invalid-host"]
      }
    ];

    for (const testCase of cases) {
      await assertUsageError(projectRoot, testCase);
    }

    return {
      enabled: true,
      matched: cases.map((testCase) => testCase.label),
      keywords: cases.flatMap((testCase) => testCase.keywords)
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runUsageErrorRegression(projectRoot) {
  const cases = [
    {
      label: "未知子命令",
      args: ["unknown-cmd"],
      keywords: ["不支持的子命令", "unknown-cmd"]
    },
    {
      label: "recall 缺少 prompt",
      args: ["recall"],
      keywords: ["缺少必填参数 --prompt"]
    },
    {
      label: "project-onboard 缺少 focus",
      args: [
        "project-onboard",
        "--project-name",
        "Hippocode",
        "--project-summary",
        "summary",
        "--current-phase",
        "Phase 2 MVP"
      ],
      keywords: ["project-onboard 至少需要一个 --focus"]
    },
    {
      label: "reflect 缺少 session-event",
      args: ["reflect", "--outcome", "done"],
      keywords: ["reflect 至少需要一个 --session-event"]
    },
    {
      label: "deep-sleep 缺少 candidate-layer",
      args: ["deep-sleep", "--summary", "summary"],
      keywords: ["deep-sleep 至少需要一个 --candidate-layer"]
    },
    {
      label: "非法 exposure",
      args: ["recall", "--prompt", "runtime", "--exposure", "invalid"],
      keywords: ["--exposure", "实际收到 invalid"]
    },
    {
      label: "非法 risk-profile",
      args: ["forecast", "--task", "runtime", "--risk-profile", "critical"],
      keywords: ["--risk-profile", "实际收到 critical"]
    },
    {
      label: "非法 signal-strength",
      args: ["sleep", "--summary", "runtime", "--signal-strength", "critical"],
      keywords: ["--signal-strength", "实际收到 critical"]
    },
    {
      label: "非法 limit",
      args: ["recall", "--prompt", "runtime", "--limit", "0"],
      keywords: ["--limit 必须是正整数", "实际收到 0"]
    },
    {
      label: "非法 recent-limit",
      args: ["status", "--recent-limit", "-1"],
      keywords: ["--recent-limit 必须是正整数", "实际收到 -1"]
    },
    {
      label: "非法 min-confidence",
      args: ["prune", "--min-confidence", "1.5"],
      keywords: ["--min-confidence 必须是 0 到 1 之间的数字", "实际收到 1.5"]
    },
    {
      label: "非法 stale-days",
      args: ["prune", "--stale-days", "0"],
      keywords: ["--stale-days 必须是正整数", "实际收到 0"]
    }
  ];

  for (const testCase of cases) {
    await assertUsageError(projectRoot, testCase);
  }

  return {
    count: cases.length,
    labels: cases.map((testCase) => testCase.label)
  };
}

async function run() {
  const projectRoot = process.cwd();
  const smoke = await runSuccessSmoke(projectRoot);
  const usage = await runUsageErrorRegression(projectRoot);
  const initUsage = await runOptionalInitUsageRegression(projectRoot);

  console.log("CLI usage/error regression passed.");
  console.log(`smoke: ${JSON.stringify(smoke)}`);
  console.log(`usage: ${JSON.stringify(usage)}`);
  console.log(`init: ${JSON.stringify(initUsage)}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CLI usage/error regression failed:\n${message}`);
  process.exitCode = 1;
});
