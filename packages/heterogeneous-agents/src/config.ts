export type HeterogeneousAgentMenuLabelKey = 'newClaudeCodeAgent' | 'newCodexAgent';

/**
 * Config for local CLI hetero agents (Claude Code, Codex) that run as
 * desktop subprocesses via Electron IPC. Remote device agents (openclaw,
 * hermes) have their own setup flow and are not listed here.
 */
export interface HeterogeneousAgentConfig {
  command: string;
  iconId: string;
  menuKey: string;
  menuLabelKey: HeterogeneousAgentMenuLabelKey;
  title: string;
  type: 'claude-code' | 'codex';
}

export const HETEROGENEOUS_AGENT_CONFIGS = [
  {
    command: 'claude',
    iconId: 'ClaudeCode',
    menuKey: 'newClaudeCodeAgent',
    menuLabelKey: 'newClaudeCodeAgent',
    title: 'Claude Code',
    type: 'claude-code',
  },
  {
    command: 'codex',
    iconId: 'Codex',
    menuKey: 'newCodexAgent',
    menuLabelKey: 'newCodexAgent',
    title: 'Codex',
    type: 'codex',
  },
] as const satisfies readonly HeterogeneousAgentConfig[];

export const getHeterogeneousAgentConfig = (type: string) =>
  HETEROGENEOUS_AGENT_CONFIGS.find((config) => config.type === type);
