import { query } from '@anthropic-ai/claude-agent-sdk';
import { normalizeImage } from '@lobechat/heterogeneous-agents/spawn';

import type {
  HeterogeneousAgentDriver,
  HeterogeneousAgentImageAttachment,
  HeterogeneousAgentStartStreamParams,
  HeterogeneousAgentStreamHandle,
} from '../types';

/**
 * Build the user-message content blocks consumed by `query()`. The SDK
 * expects Anthropic's `MessageParam.content` shape — a `text` block plus one
 * `image` block per attachment, with the image bytes inlined as base64. We
 * fetch + cache via the shared `normalizeImage` helper (same one the spawn
 * path uses for Codex `--image <file>`) but skip `materializeImageToPath`:
 * the SDK doesn't take filesystem paths, it embeds the bytes in the JSON
 * control message.
 *
 * Failures are escalated to the caller so a partially-attached prompt never
 * reaches the model — matches the existing `resolveCliImagePaths` contract.
 */
const buildUserContent = async (
  prompt: string,
  imageList: HeterogeneousAgentImageAttachment[] | undefined,
  cacheDir: string,
): Promise<Array<Record<string, unknown>>> => {
  const content: Array<Record<string, unknown>> = [];
  if (prompt && prompt.length > 0) content.push({ text: prompt, type: 'text' });
  if (!imageList?.length) return content;

  const results = await Promise.allSettled(
    imageList.map((image) =>
      normalizeImage({ id: image.id, type: 'url', url: image.url }, { cacheDir }),
    ),
  );

  const failures: string[] = [];
  for (const [index, result] of results.entries()) {
    const imageId = imageList[index]?.id ?? `image-${index + 1}`;
    if (result.status === 'fulfilled') {
      content.push({
        source: {
          data: result.value.buffer.toString('base64'),
          media_type: result.value.mediaType,
          type: 'base64',
        },
        type: 'image',
      });
      continue;
    }
    const reason = result.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    failures.push(`${imageId}: ${message}`);
  }

  if (failures.length > 0) {
    throw new Error(`Failed to attach image(s) to Claude Code SDK: ${failures.join('; ')}`);
  }

  return content;
};

const parseExtraArgs = (args: string[]): Record<string, string | null> => {
  // The SDK's `extraArgs` is `{ [argName]: string | null }`. `null` means
  // boolean flag (no value), string means flag + value. Map a flat argv-style
  // list to that shape, dropping the `--` prefix.
  const out: Record<string, string | null> = {};
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (!raw?.startsWith('--')) continue;
    const key = raw.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = null;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
};

export const claudeCodeSdkDriver: HeterogeneousAgentDriver = {
  async startStream(
    params: HeterogeneousAgentStartStreamParams,
  ): Promise<HeterogeneousAgentStreamHandle> {
    const {
      abortSignal,
      args,
      cwd,
      env,
      imageList,
      mcpConfigPath,
      onStderr,
      pathToClaudeCodeExecutable,
      prompt,
      resumeSessionId,
    } = params;

    if (!pathToClaudeCodeExecutable) {
      // Fail loudly. The SDK would otherwise look for its bundled platform
      // binary (which `apps/desktop/.pnpmfile.cjs` strips on install) and
      // exit with a confusing ENOENT.
      throw new Error(
        'claudeCodeSdk: pathToClaudeCodeExecutable is required (refusing to fall back to bundled binary)',
      );
    }

    const content = await buildUserContent(prompt, imageList, `${cwd}/.heerogeneous-tracing`);

    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (abortSignal.aborted) ac.abort();
    else abortSignal.addEventListener('abort', onAbort, { once: true });

    // mcpConfigPath is the AskUserQuestion local MCP server config written by
    // the controller. Until LOBE-8746 swaps to SDK-native AskUserQuestion,
    // we forward it via `extraArgs` so the SDK's bundled CLI loads it the
    // same way the spawn path does (`--mcp-config <path>`).
    const extraArgs = parseExtraArgs(args);
    if (mcpConfigPath) extraArgs['mcp-config'] = mcpConfigPath;

    const q = query({
      prompt: {
        message: { content, role: 'user' },
        parent_tool_use_id: null,
        type: 'user',
      },
      options: {
        abortController: ac,
        allowDangerouslySkipPermissions: true,
        cwd,
        env,
        extraArgs,
        // Mirror current spawn behavior: --include-partial-messages on so the
        // chat bubble streams text/thinking deltas instead of waiting for the
        // full block.
        includePartialMessages: true,
        onElicitation: undefined,
        pathToClaudeCodeExecutable,
        permissionMode: 'bypassPermissions',
        resume: resumeSessionId,
        // Don't load filesystem settings (~/.claude/, .claude/) — the desktop
        // app's CC sessions are scoped to the workspace `cwd` and shouldn't
        // pick up the user's personal CLAUDE.md / agents / hooks. Matches the
        // current spawn path which doesn't pass --settings.
        settingSources: [],
        stderr: onStderr,
      },
    });

    const cleanup = () => {
      abortSignal.removeEventListener('abort', onAbort);
    };

    return {
      close: () => {
        cleanup();
        try {
          q.close();
        } catch {
          // close() may throw if the iterator already settled; ignore.
        }
      },
      interrupt: async () => {
        // `interrupt()` is only valid in streaming-input mode (multi-turn
        // AsyncIterable prompt). For the current single-prompt-per-spawn
        // model, fall back to abort which the SDK turns into a clean exit.
        ac.abort();
      },
      messages: q,
    };
  },
};
