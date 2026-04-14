import type { HippoCommandName } from "../core/types.js";

export interface CliCommandDescriptor {
  name: HippoCommandName;
  description: string;
  maturity: "documented" | "planned" | "implemented";
}

export const CLI_COMMANDS: CliCommandDescriptor[] = [
  {
    name: "/hippo:recall",
    description: "召回当前任务最相关的项目记忆摘要。",
    maturity: "implemented"
  },
  {
    name: "/hippo:forecast",
    description: "根据 recall 结果给出执行路径预测与验证点。",
    maturity: "implemented"
  },
  {
    name: "/hippo:reflect",
    description: "在执行后记录偏差、有效信号与可复用经验。",
    maturity: "implemented"
  },
  {
    name: "/hippo:sleep",
    description: "将当前任务压缩为 episodic 记忆候选。",
    maturity: "implemented"
  },
  {
    name: "/hippo:associate",
    description: "做更深一层的关系扩散与联想召回。",
    maturity: "planned"
  },
  {
    name: "/hippo:active-recall",
    description: "在高风险任务前触发更主动的 recall。",
    maturity: "planned"
  },
  {
    name: "/hippo:deep-sleep",
    description: "把已验证的候选记忆晋升到长期层。",
    maturity: "implemented"
  },
  {
    name: "/hippo:project-onboard",
    description: "建立或刷新项目画像与当前焦点。",
    maturity: "documented"
  },
  {
    name: "/hippo:prune",
    description: "清理低价值或过时的记忆。",
    maturity: "documented"
  },
  {
    name: "/hippo:status",
    description: "查看记忆系统当前状态与候选积压。",
    maturity: "documented"
  }
];

export function listImplementedCliCommands(): CliCommandDescriptor[] {
  return CLI_COMMANDS.filter((command) => command.maturity === "implemented");
}
