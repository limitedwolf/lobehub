import superjson from 'superjson';
import { describe, expect, it } from 'vitest';

import { transformer } from './transformer';

describe('trpc transformer (prototype-pollution hardened superjson)', () => {
  it('reproduces the superjson serialize guard that bare superjson throws on', () => {
    // sanity check: the bare transformer is the thing that 500s the batch
    expect(() => superjson.serialize({ prototype: 1 })).toThrow(/Detected property prototype/);
  });

  it('serializes output containing a literal `prototype` key instead of throwing', () => {
    const payload = { data: [{ id: 'doc-1', metadata: { prototype: 'oops', title: 'Doc' } }] };

    expect(() => transformer.serialize(payload)).not.toThrow();

    const roundTripped = transformer.deserialize(transformer.serialize(payload));
    expect(roundTripped).toEqual({
      data: [{ id: 'doc-1', metadata: { title: 'Doc' } }],
    });
  });

  it('strips `__proto__` / `constructor` / `prototype` own keys at any depth', () => {
    // `{ __proto__: ... }` literal sets the prototype, so build an own key via JSON.parse
    const poisoned = JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "keep": 2}');
    const payload = { nested: { list: [poisoned] }, prototype: 'x' };

    const result = transformer.deserialize(transformer.serialize(payload)) as any;

    expect(result).toEqual({ nested: { list: [{ keep: 2 }] } });
    // and global prototype was not polluted in the process
    expect(({} as any).polluted).toBeUndefined();
  });

  it('preserves superjson-handled special types (Date, Map, undefined)', () => {
    const date = new Date('2026-06-23T04:00:00.000Z');
    const payload = {
      map: new Map([['a', 1]]),
      missing: undefined,
      when: date,
    };

    const result = transformer.deserialize(transformer.serialize(payload)) as typeof payload;

    expect(result.when).toBeInstanceOf(Date);
    expect(result.when.toISOString()).toBe('2026-06-23T04:00:00.000Z');
    expect(result.map).toBeInstanceOf(Map);
    expect(result.map.get('a')).toBe(1);
    expect('missing' in result).toBe(true);
  });

  it('round-trips normal data identically to bare superjson', () => {
    const payload = { items: [{ count: 3, tags: ['a', 'b'] }], total: 1 };

    expect(transformer.deserialize(transformer.serialize(payload))).toEqual(payload);
  });
});
