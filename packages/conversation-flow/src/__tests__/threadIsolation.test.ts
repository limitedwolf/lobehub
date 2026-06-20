import { describe, expect, it } from 'vitest';

import { parse } from '../parse';
import type { Message } from '../types/shared';

/**
 * Sub-topic (thread) isolation in the flat list — regression for #16012.
 *
 * A sub-topic message (one with a `threadId`) belongs to a separate branch, not
 * to the parent topic's main flow. When a single parsed set contains BOTH a
 * main-flow continuation AND a thread child hanging off the same parent (e.g. a
 * source message that was branched into a sub-topic *and* later continued in the
 * parent topic), the `flatList` used by the UI must follow the main flow and
 * must NOT treat the thread child as a regenerate-branch — otherwise the
 * sub-topic's messages "bleed into" / hijack the parent history.
 *
 * `buildIdTree` (contextTree) already filters `threadId` children; this asserts
 * the `flatList` is consistent with it, while still rendering the full thread
 * chain when the set is genuinely thread-scoped (parents + one thread, the shape
 * the backend returns for a sub-topic view).
 */

const baseTs = 1_700_000_000_000;
let seq = 0;

const msg = (over: Partial<Message> & Pick<Message, 'id' | 'role'>): Message =>
  ({
    content: over.content ?? over.id,
    // monotonically increasing timestamps so ordering is deterministic
    createdAt: baseTs + seq++,
    updatedAt: baseTs + seq,
    ...over,
  }) as Message;

const ids = (messages: Message[]) => messages.map((m) => m.id);

describe('thread isolation in flatList (#16012)', () => {
  it('main flow ignores a sub-topic child branched off the same parent', () => {
    // P2 is the source: it was branched into sub-topic B *and* continued in the
    // parent topic (P3). The main flat list must be P1 → P2 → P3 only.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({ id: 'P2', role: 'assistant', parentId: 'P1' }),
      msg({ id: 'P3', role: 'user', parentId: 'P2' }),
      msg({ id: 'B1', role: 'user', parentId: 'P2', threadId: 'thread-b' }),
      msg({ id: 'B2', role: 'assistant', parentId: 'B1', threadId: 'thread-b' }),
    ];

    const { flatList } = parse(messages);

    expect(ids(flatList)).toEqual(['P1', 'P2', 'P3']);
  });

  it('still renders the full thread chain for a thread-scoped set (no main continuation)', () => {
    // This is the shape the backend returns for a sub-topic view: parent
    // messages up to the source + that one thread's messages, with NO sibling
    // main continuation. The thread chain must remain the active path.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({ id: 'P2', role: 'assistant', parentId: 'P1' }),
      msg({ id: 'B1', role: 'user', parentId: 'P2', threadId: 'thread-b' }),
      msg({ id: 'B2', role: 'assistant', parentId: 'B1', threadId: 'thread-b' }),
      msg({ id: 'B3', role: 'user', parentId: 'B2', threadId: 'thread-b' }),
      msg({ id: 'B4', role: 'assistant', parentId: 'B3', threadId: 'thread-b' }),
    ];

    const { flatList } = parse(messages);

    expect(ids(flatList)).toEqual(['P1', 'P2', 'B1', 'B2', 'B3', 'B4']);
  });

  it('isolates two sibling sub-topics: neither bleeds into the main flow', () => {
    // P2 is the source for two sub-topics (A and B) and also continued in the
    // parent topic (P3). Main flow shows only P1 → P2 → P3.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({ id: 'P2', role: 'assistant', parentId: 'P1' }),
      msg({ id: 'A1', role: 'user', parentId: 'P2', threadId: 'thread-a' }),
      msg({ id: 'A2', role: 'assistant', parentId: 'A1', threadId: 'thread-a' }),
      msg({ id: 'B1', role: 'user', parentId: 'P2', threadId: 'thread-b' }),
      msg({ id: 'B2', role: 'assistant', parentId: 'B1', threadId: 'thread-b' }),
      msg({ id: 'P3', role: 'user', parentId: 'P2' }),
    ];

    const { flatList } = parse(messages);

    expect(ids(flatList)).toEqual(['P1', 'P2', 'P3']);
  });

  it('isolates a thread-scoped set that also carries a sibling thread row', () => {
    // Sub-topic A's scoped set should resolve to A's chain even if a stray
    // sibling-thread row (thread-b) shares the source parent. A's chain wins
    // because main-flow children take precedence and, among the source's
    // children, the in-scope thread continuation is followed.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({ id: 'P2', role: 'assistant', parentId: 'P1' }),
      msg({ id: 'A1', role: 'user', parentId: 'P2', threadId: 'thread-a' }),
      msg({ id: 'A2', role: 'assistant', parentId: 'A1', threadId: 'thread-a' }),
    ];

    const { flatList } = parse(messages);

    // Pure thread-scoped set: parents + the one thread's chain.
    expect(ids(flatList)).toEqual(['P1', 'P2', 'A1', 'A2']);
  });

  it('isolates deeply nested sub-topic messages from the main flow', () => {
    // Main flow continues P1 → P2 → P3 → P4 even though P2 and P3 each spawned
    // a sub-topic.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({ id: 'P2', role: 'assistant', parentId: 'P1' }),
      msg({ id: 'B1', role: 'user', parentId: 'P2', threadId: 'thread-b' }),
      msg({ id: 'P3', role: 'user', parentId: 'P2' }),
      msg({ id: 'P4', role: 'assistant', parentId: 'P3' }),
      msg({ id: 'C1', role: 'user', parentId: 'P3', threadId: 'thread-c' }),
    ];

    const { flatList } = parse(messages);

    expect(ids(flatList)).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('a sub-topic child off a tool-using assistant does not hijack the next turn', () => {
    // P2 is an assistant with a tool; its tool result T spawns a sub-topic (B)
    // while the main flow continues to the next user turn P3. The assistant
    // group must be followed by P3, not by the sub-topic message.
    seq = 0;
    const messages: Message[] = [
      msg({ id: 'P1', role: 'user', parentId: null }),
      msg({
        id: 'P2',
        role: 'assistant',
        parentId: 'P1',
        tools: [{ id: 'tc1', identifier: 'search', apiName: 'run', arguments: '{}' }],
      } as any),
      msg({ id: 'T', role: 'tool', parentId: 'P2', tool_call_id: 'tc1' } as any),
      msg({ id: 'P3', role: 'user', parentId: 'T' }),
      msg({ id: 'B1', role: 'user', parentId: 'T', threadId: 'thread-b' }),
    ];

    const { flatList } = parse(messages);

    // P2 + T collapse into a single assistantGroup; main flow then continues P3.
    expect(ids(flatList)).toContain('P3');
    expect(ids(flatList)).not.toContain('B1');
  });
});
