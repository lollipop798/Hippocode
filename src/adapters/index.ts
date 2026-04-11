import type { HippoCommandName } from "../core/types.js";

export interface HostAdapterDescriptor {
  host: "claude" | "codex" | (string & {});
  lifecycleEvents: string[];
  supportedCommands: HippoCommandName[];
  notes?: string;
}
