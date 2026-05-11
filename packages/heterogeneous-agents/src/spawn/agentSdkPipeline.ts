import type { AgentStreamEvent } from '@lobechat/agent-gateway-client';

import { createAdapter } from '../registry';
import type { AgentEventAdapter } from '../types';
import { toStreamEvent } from './streamEvent';

export interface AgentSdkEventPipelineOptions {
  /** Agent type key — currently only `claude-code` (Codex still spawns its own CLI). */
  agentType: string;
  /** Operation id stamped onto every emitted `AgentStreamEvent`. */
  operationId: string;
}

/**
 * Producer-side pipeline for transports that already deliver parsed messages
 * (e.g. `@anthropic-ai/claude-agent-sdk`'s `query()` `AsyncGenerator<SDKMessage>`).
 *
 *   SDKMessage → adapter.adapt() → toStreamEvent
 *
 * Sibling to {@link AgentStreamPipeline}, which framing-decodes JSONL stdout
 * before feeding the same adapter. Both produce identical `AgentStreamEvent`s
 * downstream — the only difference is whether the source needs to be split into
 * lines + JSON.parsed first. Since the adapter accepts the raw provider event
 * shape unchanged (Claude Code stream-json messages and the SDK's `SDKMessage`
 * union are byte-for-byte compatible for every type the adapter handles), no
 * adapter change is needed to switch transports.
 */
export class AgentSdkEventPipeline {
  private readonly adapter: AgentEventAdapter;
  private readonly operationId: string;

  constructor(options: AgentSdkEventPipelineOptions) {
    this.adapter = createAdapter(options.agentType);
    this.operationId = options.operationId;
  }

  /** CC session id extracted by the adapter (`adapter.sessionId`). */
  get sessionId(): string | undefined {
    return this.adapter.sessionId;
  }

  /** Convert a single SDK message into stamped `AgentStreamEvent`s. */
  process(message: unknown): AgentStreamEvent[] {
    return this.adapter.adapt(message).map((event) => toStreamEvent(event, this.operationId));
  }

  /** Drain adapter-buffered events. Call after the SDK iterator finishes. */
  flush(): AgentStreamEvent[] {
    return this.adapter.flush().map((event) => toStreamEvent(event, this.operationId));
  }
}
