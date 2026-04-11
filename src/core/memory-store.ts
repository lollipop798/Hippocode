import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

import { ensureDir, fileExists, writeFileAtomic } from "../utils/fs.js";
import { slugify, summarizeText, tokenizeText, uniqueStrings } from "../utils/text.js";
import type {
  ExposureLevel,
  MemoryEntry,
  MemoryGraphSnapshot,
  MemoryLayer,
  MemoryStoreQuery,
  MemoryWriteResult
} from "./types.js";

const GRAPH_FILE_NAME = "associative-graph.json";
const PROJECT_PROFILE_FILE = "project-profile.md";
const CURRENT_FOCUS_FILE = "current-focus.md";

const LAYER_DIRECTORY_MAP: Record<Exclude<MemoryLayer, "project">, string> = {
  decision: "decisions",
  incident: "incidents",
  pattern: "patterns",
  module: "modules",
  episodic: "episodic",
  archive: "archives"
};

export interface FileMemoryStoreOptions {
  rootDir: string;
  defaultExposure?: ExposureLevel;
  now?: () => Date;
}

export interface MemoryStore {
  readonly rootDir: string;
  queryEntries(query?: MemoryStoreQuery): Promise<MemoryEntry[]>;
  readGraph(): Promise<MemoryGraphSnapshot>;
  writeGraph(snapshot: MemoryGraphSnapshot): Promise<MemoryGraphSnapshot>;
  writeEntry(entry: MemoryEntry): Promise<MemoryWriteResult>;
}

export class FileMemoryStore implements MemoryStore {
  public readonly rootDir: string;
  private readonly defaultExposure: ExposureLevel;
  private readonly now: () => Date;

  public constructor(options: FileMemoryStoreOptions) {
    this.rootDir = options.rootDir;
    this.defaultExposure = options.defaultExposure ?? "summary";
    this.now = options.now ?? (() => new Date());
  }

  public async queryEntries(query: MemoryStoreQuery = {}): Promise<MemoryEntry[]> {
    await this.ensureBaseLayout();

    const requestedLayers = query.layers?.length
      ? query.layers
      : ([
          "project",
          "decision",
          "incident",
          "pattern",
          "module",
          "episodic"
        ] as MemoryLayer[]);
    const includeArchived = query.includeArchived ?? false;
    const exposureLevel = query.exposureLevel ?? this.defaultExposure;

    const entries: MemoryEntry[] = [];

    if (requestedLayers.includes("project")) {
      entries.push(...(await this.readProjectEntries(exposureLevel)));
    }

    for (const layer of requestedLayers) {
      if (layer === "project") {
        continue;
      }

      if (layer === "archive" && !includeArchived) {
        continue;
      }

      entries.push(...(await this.readLayerEntries(layer, exposureLevel)));
    }

    const filteredEntries = this.filterEntries(entries, query);
    const limit = query.limit ?? filteredEntries.length;

    return filteredEntries.slice(0, limit);
  }

  public async readGraph(): Promise<MemoryGraphSnapshot> {
    await this.ensureBaseLayout();

    const graphPath = join(this.rootDir, GRAPH_FILE_NAME);
    const content = await readFile(graphPath, "utf8");
    const parsed = JSON.parse(content) as Partial<MemoryGraphSnapshot>;

    return {
      version: typeof parsed.version === "string" ? parsed.version : "1",
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : this.now().toISOString(),
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : []
    };
  }

  public async writeGraph(snapshot: MemoryGraphSnapshot): Promise<MemoryGraphSnapshot> {
    await this.ensureBaseLayout();

    const normalizedSnapshot: MemoryGraphSnapshot = {
      version: snapshot.version || "1",
      updatedAt: snapshot.updatedAt || this.now().toISOString(),
      nodes: snapshot.nodes,
      edges: snapshot.edges
    };

    const graphPath = join(this.rootDir, GRAPH_FILE_NAME);
    await writeFileAtomic(graphPath, `${JSON.stringify(normalizedSnapshot, null, 2)}\n`);

    return normalizedSnapshot;
  }

  public async writeEntry(entry: MemoryEntry): Promise<MemoryWriteResult> {
    await this.ensureBaseLayout();

    const path = this.resolveWritePath(entry);
    const created = !(await fileExists(path));
    const normalizedEntry = this.normalizeWritableEntry(entry, relative(this.rootDir, path));
    const content = path.endsWith(".md")
      ? this.renderMarkdownEntry(normalizedEntry)
      : `${JSON.stringify(normalizedEntry, null, 2)}\n`;

    await writeFileAtomic(path, content);

    return {
      entry: normalizedEntry,
      path,
      created
    };
  }

  private async ensureBaseLayout(): Promise<void> {
    await ensureDir(this.rootDir);

    for (const directory of Object.values(LAYER_DIRECTORY_MAP)) {
      await ensureDir(join(this.rootDir, directory));
    }

    const graphPath = join(this.rootDir, GRAPH_FILE_NAME);
    if (!(await fileExists(graphPath))) {
      const initialGraph: MemoryGraphSnapshot = {
        version: "1",
        updatedAt: this.now().toISOString(),
        nodes: [],
        edges: []
      };
      await writeFileAtomic(graphPath, `${JSON.stringify(initialGraph, null, 2)}\n`);
    }

    await this.ensureMarkdownPlaceholder(
      PROJECT_PROFILE_FILE,
      "# Project Profile\n\n- 项目：未命名项目\n- 当前阶段：待初始化\n"
    );
    await this.ensureMarkdownPlaceholder(
      CURRENT_FOCUS_FILE,
      "# Current Focus\n\n- 尚未记录当前焦点\n"
    );
  }

  private async ensureMarkdownPlaceholder(name: string, content: string): Promise<void> {
    const filePath = join(this.rootDir, name);

    if (!(await fileExists(filePath))) {
      await writeFileAtomic(filePath, content);
    }
  }

  private async readProjectEntries(exposureLevel: ExposureLevel): Promise<MemoryEntry[]> {
    const profilePath = join(this.rootDir, PROJECT_PROFILE_FILE);
    const focusPath = join(this.rootDir, CURRENT_FOCUS_FILE);

    return [
      await this.parseEntryFile(profilePath, "project", exposureLevel, "project-profile"),
      await this.parseEntryFile(focusPath, "project", exposureLevel, "current-focus")
    ];
  }

  private async readLayerEntries(
    layer: Exclude<MemoryLayer, "project">,
    exposureLevel: ExposureLevel
  ): Promise<MemoryEntry[]> {
    const directory = join(this.rootDir, LAYER_DIRECTORY_MAP[layer]);
    const names = await readdir(directory, { withFileTypes: true });
    const entries: MemoryEntry[] = [];

    for (const name of names) {
      if (!name.isFile()) {
        continue;
      }

      if (name.name === "README.md") {
        continue;
      }

      entries.push(
        await this.parseEntryFile(join(directory, name.name), layer, exposureLevel)
      );
    }

    return entries;
  }

  private async parseEntryFile(
    path: string,
    layer: MemoryLayer,
    exposureLevel: ExposureLevel,
    forcedId?: string
  ): Promise<MemoryEntry> {
    const fileStat = await stat(path);
    const rawContent = await readFile(path, "utf8");
    const relativePath = relative(this.rootDir, path);

    if (extname(path) === ".json") {
      return this.parseJsonEntry(
        rawContent,
        layer,
        forcedId ?? slugify(basename(path, ".json")),
        relativePath,
        fileStat,
        exposureLevel
      );
    }

    return this.parseMarkdownEntry(
      rawContent,
      layer,
      forcedId ?? slugify(basename(path, extname(path))),
      relativePath,
      fileStat,
      exposureLevel
    );
  }

  private parseJsonEntry(
    rawContent: string,
    layer: MemoryLayer,
    fallbackId: string,
    sourcePath: string,
    fileStat: { mtime: Date; birthtime: Date },
    exposureLevel: ExposureLevel
  ): MemoryEntry {
    const parsed = JSON.parse(rawContent) as Partial<MemoryEntry>;
    const content =
      exposureLevel === "summary" ? undefined : this.pickString(parsed.content) ?? rawContent;
    const normalizedKeywords = this.normalizeKeywords(
      Array.isArray(parsed.keywords) ? parsed.keywords : tokenizeText(rawContent)
    );

    return {
      id: this.pickString(parsed.id) ?? fallbackId,
      layer,
      title: this.pickString(parsed.title) ?? this.titleFromId(fallbackId),
      summary:
        this.pickString(parsed.summary) ?? summarizeText(this.pickString(parsed.content) ?? rawContent),
      keywords: normalizedKeywords,
      scope: this.pickString(parsed.scope) ?? layer,
      exposure: this.normalizeExposure(parsed.exposure) ?? "summary",
      sourcePath,
      ...(content ? { content } : {}),
      ...(Array.isArray(parsed.tags) && parsed.tags.length > 0 ? { tags: parsed.tags } : {}),
      ...(Array.isArray(parsed.references) && parsed.references.length > 0
        ? { references: parsed.references }
        : {}),
      createdAt: this.pickString(parsed.createdAt) ?? fileStat.birthtime.toISOString(),
      ...(this.pickString(parsed.updatedAt)
        ? { updatedAt: this.pickString(parsed.updatedAt) as string }
        : { updatedAt: fileStat.mtime.toISOString() }),
      ...(typeof parsed.confidence === "number" ? { confidence: parsed.confidence } : {}),
      ...(this.isRecord(parsed.metadata) ? { metadata: parsed.metadata } : {})
    };
  }

  private parseMarkdownEntry(
    rawContent: string,
    layer: MemoryLayer,
    fallbackId: string,
    sourcePath: string,
    fileStat: { mtime: Date; birthtime: Date },
    exposureLevel: ExposureLevel
  ): MemoryEntry {
    const lines = rawContent
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const title =
      lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/u, "").trim() ??
      this.titleFromId(fallbackId);
    const contentLines = lines.filter((line) => !line.startsWith("#"));
    const summary = summarizeText(contentLines.join(" "), 200);
    const keywords = this.normalizeKeywords(tokenizeText([title, rawContent].join(" ")));

    return {
      id: fallbackId,
      layer,
      title,
      summary,
      keywords,
      scope:
        fallbackId === "current-focus"
          ? "current-focus"
          : fallbackId === "project-profile"
            ? "project"
            : layer,
      exposure: "summary",
      sourcePath,
      ...(exposureLevel === "summary" ? {} : { content: rawContent.trim() }),
      createdAt: fileStat.birthtime.toISOString(),
      updatedAt: fileStat.mtime.toISOString()
    };
  }

  private filterEntries(entries: MemoryEntry[], query: MemoryStoreQuery): MemoryEntry[] {
    const keywords = this.normalizeKeywords(query.keywords ?? []);
    const focusPath = query.focusPath?.toLowerCase();

    const filtered = entries.filter((entry) => {
      if (entry.layer === "archive" && !(query.includeArchived ?? false)) {
        return false;
      }

      const haystack = [
        entry.title,
        entry.summary,
        entry.scope,
        entry.sourcePath ?? "",
        ...(entry.keywords ?? []),
        ...(entry.tags ?? []),
        ...(entry.references ?? [])
      ]
        .join(" ")
        .toLowerCase();

      const matchesKeywords =
        keywords.length === 0 || keywords.some((keyword) => haystack.includes(keyword));
      const matchesFocus = !focusPath || haystack.includes(focusPath);

      return matchesKeywords && matchesFocus;
    });

    return filtered.sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
      const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
      return rightTime - leftTime;
    });
  }

  private resolveWritePath(entry: MemoryEntry): string {
    if (entry.layer === "project") {
      if (entry.id === "project-profile") {
        return join(this.rootDir, PROJECT_PROFILE_FILE);
      }

      if (entry.id === "current-focus") {
        return join(this.rootDir, CURRENT_FOCUS_FILE);
      }

      return join(this.rootDir, `${slugify(entry.id, "project-entry")}.json`);
    }

    const directory = LAYER_DIRECTORY_MAP[entry.layer];
    return join(this.rootDir, directory, `${slugify(entry.id, entry.layer)}.json`);
  }

  private normalizeWritableEntry(entry: MemoryEntry, sourcePath: string): MemoryEntry {
    const createdAt = entry.createdAt || this.now().toISOString();
    const updatedAt = this.now().toISOString();

    return {
      id: entry.id || slugify(entry.title, entry.layer),
      layer: entry.layer,
      title: entry.title,
      summary: summarizeText(entry.summary, 240),
      keywords: this.normalizeKeywords(entry.keywords),
      scope: entry.scope,
      exposure: entry.exposure,
      sourcePath,
      ...(entry.content ? { content: entry.content } : {}),
      ...(entry.tags && entry.tags.length > 0 ? { tags: uniqueStrings(entry.tags) } : {}),
      ...(entry.references && entry.references.length > 0
        ? { references: uniqueStrings(entry.references) }
        : {}),
      createdAt,
      updatedAt,
      ...(typeof entry.confidence === "number" ? { confidence: entry.confidence } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {})
    };
  }

  private renderMarkdownEntry(entry: MemoryEntry): string {
    const lines = [
      `# ${entry.title}`,
      "",
      `- id: ${entry.id}`,
      `- layer: ${entry.layer}`,
      `- scope: ${entry.scope}`,
      `- exposure: ${entry.exposure}`,
      `- createdAt: ${entry.createdAt}`,
      `- updatedAt: ${entry.updatedAt ?? entry.createdAt}`,
      `- keywords: ${entry.keywords.join(", ")}`,
      "",
      entry.summary
    ];

    if (entry.content) {
      lines.push("", entry.content);
    }

    return `${lines.join("\n")}\n`;
  }

  private normalizeKeywords(values: string[]): string[] {
    return uniqueStrings(values.map((value) => value.toLowerCase())).slice(0, 12);
  }

  private normalizeExposure(value: unknown): ExposureLevel | undefined {
    return value === "summary" || value === "focused" || value === "full" ? value : undefined;
  }

  private pickString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private titleFromId(id: string): string {
    return id
      .split(/[-_]/u)
      .filter((segment) => segment.length > 0)
      .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
      .join(" ");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

export function createFileMemoryStore(options: FileMemoryStoreOptions): MemoryStore {
  return new FileMemoryStore(options);
}
