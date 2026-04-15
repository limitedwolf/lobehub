// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRedis } from './__tests__/fakeRedis';
import { buildServerCtxKey } from './ctxKey';
import { MessageQueueService } from './index';
import { CHECK_AND_ENQUEUE_SHA, DRAIN_ON_COMPLETE_SHA } from './luaScripts';
import type { QueuedInboundMessage } from './types';

const buildMsg = (
  id: string,
  overrides: Partial<QueuedInboundMessage> = {},
): QueuedInboundMessage => ({
  content: `msg-${id}`,
  createdAt: Date.now(),
  id,
  interruptMode: 'soft',
  source: 'gateway',
  ...overrides,
});

describe('MessageQueueService', () => {
  let redis: FakeRedis;
  let service: MessageQueueService;
  const ctxKey = buildServerCtxKey({ agentId: 'agt_a', topicId: 'tpc_t', userId: 'u1' });

  beforeEach(() => {
    redis = new FakeRedis();
    service = new MessageQueueService(redis.asRedis(), { maxQueueLen: 3 });
  });

  describe('checkAndEnqueue', () => {
    it("returns 'proceed' when no active run and claims the slot atomically", async () => {
      const { decision, placeholderActiveId } = await service.checkAndEnqueue(
        ctxKey,
        buildMsg('a'),
      );
      expect(decision).toBe('proceed');
      expect(placeholderActiveId).toMatch(/^pending-/);
      // The Lua script must have SET the active key so a follow-up call
      // races into 'queued' instead of also proceeding.
      expect(await service.getActiveOperationId(ctxKey)).toBe(placeholderActiveId);
    });

    it("returns 'queued' after markActive and enqueues", async () => {
      await service.markActive(ctxKey, 'op-1');
      const a = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      const b = await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      expect(a.decision).toBe('queued');
      expect(b.decision).toBe('queued');
      const peek = await service.peekQueue(ctxKey);
      expect(peek.map((m) => m.id)).toEqual(['a', 'b']);
    });

    it("returns 'duplicate' for repeated msgIds while active", async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      const dup = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      expect(dup.decision).toBe('duplicate');
    });

    it("returns 'rejected' once maxQueueLen is reached", async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await service.checkAndEnqueue(ctxKey, buildMsg('c'));
      const fourth = await service.checkAndEnqueue(ctxKey, buildMsg('d'));
      expect(fourth.decision).toBe('rejected');
    });

    it('serialises 10 concurrent enqueues: exactly one proceeds, rest queued in order', async () => {
      const big = new MessageQueueService(redis.asRedis(), { maxQueueLen: 50 });
      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) => big.checkAndEnqueue(ctxKey, buildMsg(`m${i}`))),
      );
      // With the Lua gate claiming the active slot atomically on 'proceed',
      // only the first invocation to execute the script sees no active —
      // the other nine observe the placeholder and queue in order.
      const proceeds = outcomes.filter((o) => o.decision === 'proceed');
      const queued = outcomes.filter((o) => o.decision === 'queued');
      expect(proceeds).toHaveLength(1);
      expect(queued).toHaveLength(9);
      expect(await big.peekQueue(ctxKey)).toHaveLength(9);
    });
  });

  describe('drainOnComplete', () => {
    it('returns all queued messages and clears state when opId matches', async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      const drained = await service.drainOnComplete(ctxKey, 'op-1');
      expect(drained.map((m) => m.id)).toEqual(['a', 'b']);
      expect(await service.peekQueue(ctxKey)).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
    });

    it('is a no-op when opId does not match (stale webhook retry)', async () => {
      await service.markActive(ctxKey, 'op-1');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      const drained = await service.drainOnComplete(ctxKey, 'wrong-op');
      expect(drained).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBe('op-1');
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['a']);
    });

    it('returns empty when no active exists', async () => {
      await expect(service.drainOnComplete(ctxKey, 'op-1')).resolves.toEqual([]);
    });
  });

  describe('EVALSHA fallback', () => {
    it('falls back to EVAL on NOSCRIPT and then uses EVALSHA', async () => {
      const evalSpy = vi.spyOn(redis, 'eval');
      const evalshaSpy = vi.spyOn(redis, 'evalsha');
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      // First call: EVALSHA miss (NOSCRIPT) → EVAL fallback
      expect(evalshaSpy).toHaveBeenCalled();
      expect(evalSpy).toHaveBeenCalled();
      evalSpy.mockClear();
      evalshaSpy.mockClear();
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      // Second call: EVALSHA hits cached script
      expect(evalshaSpy).toHaveBeenCalled();
      expect(evalSpy).not.toHaveBeenCalled();
    });

    it('uses the SHA expected by the Lua loader', () => {
      expect(CHECK_AND_ENQUEUE_SHA).toMatch(/^[\da-f]{40}$/);
      expect(DRAIN_ON_COMPLETE_SHA).toMatch(/^[\da-f]{40}$/);
    });
  });

  describe('peekQueue / removeQueued / cancelAndClear', () => {
    it('peek returns enqueue order', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await service.checkAndEnqueue(ctxKey, buildMsg('c'));
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('removeQueued removes a matching id and clears dedup so it can re-enter', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      await expect(service.removeQueued(ctxKey, 'a')).resolves.toBe(1);
      await expect(service.removeQueued(ctxKey, 'missing')).resolves.toBe(0);
      expect((await service.peekQueue(ctxKey)).map((m) => m.id)).toEqual(['b']);
      // After removal, dedup releases → re-enqueue accepted
      const reentry = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      expect(reentry.decision).toBe('queued');
    });

    it('cancelAndClear wipes active, queue and dedup', async () => {
      await service.markActive(ctxKey, 'op');
      await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      await service.cancelAndClear(ctxKey);
      expect(await service.peekQueue(ctxKey)).toEqual([]);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
      // dedup was cleared too
      await service.markActive(ctxKey, 'op2');
      const second = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      expect(second.decision).toBe('queued');
    });
  });

  it('markActive TTL expires release the slot', async () => {
    vi.useFakeTimers();
    try {
      await service.markActive(ctxKey, 'op', 1);
      expect(await service.getActiveOperationId(ctxKey)).toBe('op');
      vi.setSystemTime(Date.now() + 2000);
      expect(await service.getActiveOperationId(ctxKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('error / interrupted release', () => {
    it('after drainOnComplete with matching opId, next message proceeds', async () => {
      const first = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      expect(first.decision).toBe('proceed');
      // Caller upgrades placeholder to real opId
      await service.markActive(ctxKey, 'op-1');
      // Run completes (or errors) — drain releases the active slot
      await service.drainOnComplete(ctxKey, 'op-1');
      // Next inbound message is no longer blocked
      const next = await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      expect(next.decision).toBe('proceed');
    });

    it('cancelAndClear unblocks a leaked placeholder from a failed startup', async () => {
      const first = await service.checkAndEnqueue(ctxKey, buildMsg('a'));
      expect(first.decision).toBe('proceed');
      // Simulate execAgent throwing before markActive — placeholder leaks
      expect(await service.getActiveOperationId(ctxKey)).toBe(first.placeholderActiveId);
      // Caller recovery path clears the slot
      await service.cancelAndClear(ctxKey);
      const next = await service.checkAndEnqueue(ctxKey, buildMsg('b'));
      expect(next.decision).toBe('proceed');
    });
  });
});
