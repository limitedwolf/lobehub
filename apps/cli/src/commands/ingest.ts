import { createInterface } from 'node:readline';

import type { Command } from 'commander';
import pc from 'picocolors';

import { getTrpcClient } from '../api/client';
import { log } from '../utils/logger';

/**
 * Detect step boundaries in Claude Code stream-json output.
 *
 * A "step" boundary occurs when a new assistant `message.id` appears,
 * indicating the start of a new CC turn. We flush the accumulated lines
 * for the previous step before starting the new one.
 *
 * On stdin EOF (CC process exits), we flush the remaining buffer.
 */
export function registerIngestCommand(program: Command) {
  program
    .command('ingest')
    .description(
      'Pipe Claude Code stream-json stdout to LobeHub, persisting structured messages per step',
    )
    .requiredOption('--topic-id <id>', 'Target topic ID')
    .option('--agent-id <id>', 'Agent ID')
    .option('--json', 'Output JSON results')
    .action(async (options: { agentId?: string; json?: boolean; topicId: string }) => {
      log.debug('ingest: topicId=%s, agentId=%s', options.topicId, options.agentId);

      const client = await getTrpcClient();
      const rl = createInterface({ input: process.stdin });

      let buffer: any[] = [];
      let currentMessageId: string | undefined;
      let stepCount = 0;

      const flush = async (lines: any[]) => {
        if (lines.length === 0) return;
        stepCount++;

        try {
          const result = await (client as any).cloudClaudeCode.ingest.mutate({
            agentId: options.agentId,
            lines,
            topicId: options.topicId,
          });

          if (options.json) {
            console.log(JSON.stringify({ step: stepCount, ...result }));
          } else {
            const toolInfo =
              result.toolMessageIds?.length > 0 ? ` + ${result.toolMessageIds.length} tool(s)` : '';
            console.error(
              `${pc.green('↑')} Step ${stepCount}: ${pc.bold(result.assistantMessageId || 'no-msg')}${toolInfo}`,
            );
          }
        } catch (error: any) {
          console.error(`${pc.red('✗')} Step ${stepCount} failed: ${error.message}`);
        }
      };

      for await (const raw of rl) {
        let line: any;
        try {
          line = JSON.parse(raw);
        } catch {
          // Skip non-JSON lines (stderr leaks, etc.)
          continue;
        }

        // Detect step boundary: assistant message.id change
        if (line.type === 'assistant' && line.message?.id) {
          if (currentMessageId && line.message.id !== currentMessageId) {
            // New message.id → previous step is complete → flush
            const prevStepLines = buffer;
            buffer = [line];
            await flush(prevStepLines);
          } else {
            buffer.push(line);
          }
          currentMessageId = line.message.id;
        } else {
          buffer.push(line);
        }
      }

      // stdin EOF → CC finished → flush remaining
      await flush(buffer);

      if (!options.json) {
        console.error(
          `${pc.green('✓')} Done: ${stepCount} step(s) ingested to topic ${pc.bold(options.topicId)}`,
        );
      }
    });
}
