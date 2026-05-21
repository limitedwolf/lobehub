/**
 * Agent execution mode
 * - auto: automatically decide execution strategy
 * - plan: plan first then execute, suitable for complex tasks
 * - ask: ask for user confirmation before execution
 * - implement: execute directly without asking
 */
export type AgentMode = 'auto' | 'plan' | 'ask' | 'implement';

/**
 * Runtime environment mode
 * - local: Run on a specific device (desktop only, requires deviceId)
 * - sandbox: Run in isolated cloud sandbox
 * - cloud: @deprecated Use 'sandbox' instead, kept for backward compatibility
 * - none: No runtime environment
 */
export type RuntimeEnvMode = 'cloud' | 'local' | 'none' | 'sandbox';

export type RuntimePlatform = 'desktop' | 'web';

/**
 * Runtime environment configuration
 */
export interface RuntimeEnvConfig {
  /**
   * Device ID when runtimeMode is 'local' (desktop only).
   * Identifies which bound device to run on.
   */
  deviceId?: string;
  /**
   * Runtime environment mode per platform
   */
  runtimeMode?: Partial<Record<RuntimePlatform, RuntimeEnvMode>>;
  /**
   * Working directory (desktop only)
   */
  workingDirectory?: string;
}
