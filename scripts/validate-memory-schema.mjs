#!/usr/bin/env node

import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, resolve } from "node:path";
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

async function collectMemoryRoots(projectRoot) {
  const roots = [resolve(projectRoot, ".memory")];
  const fixturesRoot = resolve(projectRoot, "fixtures");

  try {
    const fixtureDirs = await readdir(fixturesRoot, { withFileTypes: true });

    for (const fixtureDir of fixtureDirs) {
      if (!fixtureDir.isDirectory()) {
        continue;
      }

      const memoryRoot = join(fixturesRoot, fixtureDir.name, ".memory");

      try {
        await assertReadable(memoryRoot, `${fixtureDir.name} fixture .memory`);
        roots.push(memoryRoot);
      } catch {
        continue;
      }
    }
  } catch {
    return roots;
  }

  return roots;
}

async function run() {
  const projectRoot = process.cwd();
  const distEntryPath = resolve(projectRoot, "dist/index.js");
  await assertReadable(distEntryPath, "构建产物 dist/index.js");

  const { createFileMemoryStore } = await import(pathToFileURL(distEntryPath).href);
  assert(typeof createFileMemoryStore === "function", "dist 导出缺少 createFileMemoryStore。");

  const memoryRoots = await collectMemoryRoots(projectRoot);
  const summaries = [];

  for (const memoryRoot of memoryRoots) {
    const store = createFileMemoryStore({ rootDir: memoryRoot, defaultExposure: "full" });
    const graph = await store.readGraph();
    const entries = await store.queryEntries({
      includeArchived: true,
      exposureLevel: "full",
      limit: 1000
    });

    summaries.push({
      memoryRoot,
      graphNodes: graph.nodes.length,
      graphEdges: graph.edges.length,
      entries: entries.length
    });
  }

  console.log("Memory schema validation passed.");

  for (const summary of summaries) {
    console.log(
      `${summary.memoryRoot}: entries=${summary.entries}, graphNodes=${summary.graphNodes}, graphEdges=${summary.graphEdges}`
    );
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Memory schema validation failed:\n${message}`);
  process.exitCode = 1;
});
