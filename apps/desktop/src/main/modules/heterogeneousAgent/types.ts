export interface HeterogeneousAgentImageAttachment {
  id: string;
  url: string;
}

export interface HeterogeneousAgentBuildPlan {
  args: string[];
  stdinPayload?: string;
}

export interface HeterogeneousAgentBuildPlanHelpers {
  buildClaudeStreamJsonInput: (
    prompt: string,
    imageList: HeterogeneousAgentImageAttachment[],
  ) => Promise<string>;
  resolveCliImagePaths: (imageList: HeterogeneousAgentImageAttachment[]) => Promise<string[]>;
}

export interface HeterogeneousAgentBuildPlanParams {
  args: string[];
  helpers: HeterogeneousAgentBuildPlanHelpers;
  imageList: HeterogeneousAgentImageAttachment[];
  /**
   * Optional path to an MCP config JSON written by the controller (e.g. for
   * the local `lobe_cc` AskUserQuestion server). Drivers that recognize the
   * field append `--mcp-config <path>`; others ignore it.
   */
  mcpConfigPath?: string;
  prompt: string;
  resumeSessionId?: string;
}

export interface HeterogeneousAgentStartStreamParams extends HeterogeneousAgentBuildPlanParams {
  /**
   * Aborted by the controller on cancelSession / stopSession / app quit. The
   * driver MUST react by killing its underlying transport (e.g. SDK
   * `query.close()` via the wrapped `AbortController`) so the iterator
   * settles.
   */
  abortSignal: AbortSignal;
  /** Working directory for the spawned subprocess. */
  cwd: string;
  /** Forwarded environment (proxy + per-session env). */
  env?: Record<string, string>;
  /** Stderr callback — controller writes this to the trace `stderr.log`. */
  onStderr?: (chunk: string) => void;
  /**
   * Absolute path to the user-installed `claude` (or `codex`) executable.
   * **Required** for SDK-backed drivers. Passing it is the desktop's
   * deliberate gate against the SDK silently falling back to its bundled
   * 200MB platform binary — the install hook (`apps/desktop/.pnpmfile.cjs`)
   * already strips those optional deps, but we double-belt by enforcing
   * this at the call site.
   */
  pathToClaudeCodeExecutable: string;
}

export interface HeterogeneousAgentStreamHandle {
  /** Close the underlying transport and release resources. Idempotent. */
  close: () => void;
  /**
   * Cooperative interrupt (e.g. SDK `query.interrupt()`); for cancellation
   * use the `abortSignal` passed at start time.
   */
  interrupt?: () => Promise<void>;
  /** Pre-parsed provider events ready to feed `AgentSdkEventPipeline.process`. */
  messages: AsyncIterable<unknown>;
}

/**
 * Per-agent transport contract.
 *
 * Two mutually-exclusive flows; a driver implements exactly one:
 *
 * - {@link buildSpawnPlan}: legacy spawn-and-pipe path. Driver returns the
 *   CLI args + optional stdin payload; the controller spawns a child
 *   process, frames stdout via {@link AgentStreamPipeline}, and adapter
 *   conversion runs on the parsed JSONL. Codex still uses this.
 * - {@link startStream}: SDK-backed path. Driver returns an async iterable
 *   of already-parsed provider messages plus an interrupt/close handle;
 *   the controller pumps them through {@link AgentSdkEventPipeline} (which
 *   reuses the same adapter — message shapes are identical).
 *
 * Driver authors MUST implement at least one. The controller picks the
 * SDK path when `startStream` is present.
 */
export interface HeterogeneousAgentDriver {
  buildSpawnPlan?: (
    params: HeterogeneousAgentBuildPlanParams,
  ) => Promise<HeterogeneousAgentBuildPlan>;
  startStream?: (
    params: HeterogeneousAgentStartStreamParams,
  ) => Promise<HeterogeneousAgentStreamHandle>;
}
