import {
  HIPPO_COMMANDS,
  HOST_LIFECYCLE_EVENTS,
  type HippoCommandName,
  type HostLifecycleEvent
} from "../core/types.js";

export interface HostLifecyclePayload {
  event: HostLifecycleEvent;
  command?: HippoCommandName;
  prompt?: string;
  touchedFiles?: string[];
  metadata?: Record<string, unknown>;
}

export interface HostAdapterDescriptor {
  host: "claude" | "codex" | (string & {});
  lifecycleEvents: HostLifecycleEvent[];
  supportedCommands: HippoCommandName[];
  notes?: string;
}

const CORE_RUNTIME_COMMANDS = HIPPO_COMMANDS.filter((command) =>
  ["/hippo:recall", "/hippo:forecast", "/hippo:reflect", "/hippo:sleep", "/hippo:deep-sleep"].includes(command)
);

export const CLAUDE_HOST_ADAPTER: HostAdapterDescriptor = {
  host: "claude",
  lifecycleEvents: [...HOST_LIFECYCLE_EVENTS],
  supportedCommands: [...CORE_RUNTIME_COMMANDS],
  notes:
    "Claude 宿主优先使用 summary-first 输出，并在 sessionStart / preTool / postTool / sessionEnd 四类场景对接 recall、forecast、reflect、sleep。"
};

export const CODEX_HOST_ADAPTER: HostAdapterDescriptor = {
  host: "codex",
  lifecycleEvents: [...HOST_LIFECYCLE_EVENTS],
  supportedCommands: [...CORE_RUNTIME_COMMANDS],
  notes:
    "Codex 宿主保持与 Claude 一致的命令契约，但输出更偏向结构化和 CLI 友好的摘要。"
};

export const HOST_ADAPTERS: HostAdapterDescriptor[] = [
  CLAUDE_HOST_ADAPTER,
  CODEX_HOST_ADAPTER
];

export function getHostAdapterDescriptor(host: string): HostAdapterDescriptor | undefined {
  return HOST_ADAPTERS.find((descriptor) => descriptor.host === host);
}
