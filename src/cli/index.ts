import type { HippoCommandName } from "../core/types.js";

export interface CliCommandDescriptor {
  name: HippoCommandName;
  description: string;
  maturity: "documented" | "planned" | "implemented";
}
