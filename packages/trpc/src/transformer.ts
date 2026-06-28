import superjson from 'superjson';

/**
 * superjson (>= 2.2.x) hardens its **serializer** against prototype pollution:
 * while walking an object graph it throws
 * `Detected property ${key}. This is a prototype pollution risk, ...`
 * the moment it meets an own key named `__proto__`, `constructor` or
 * `prototype` (see `superjson/dist/plainer.js` -> `walker`).
 *
 * On the tRPC server the response of every procedure is serialized through this
 * transformer. With `httpBatchLink`, a batch packs many procedures into one
 * response that is serialized **as a whole, after every procedure has already
 * resolved** — outside each procedure's own try/catch. So if a *single*
 * procedure returns data that happens to contain one of those literal keys
 * (typically a JSONB `metadata` / content value persisted by an agent or tool),
 * superjson throws and the **entire batch 500s**, taking down unrelated reads
 * (subscription / topics / messages / memories ...). See LOBE-10706.
 *
 * These keys must never travel over the wire anyway — keeping them would be the
 * very prototype-pollution risk superjson guards against. So instead of letting
 * one poisoned record break a whole workspace load, we strip them from the value
 * *before* serialization. The deserializer is left untouched, so untrusted
 * inbound payloads still hit superjson's built-in guard.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Recursively remove prototype-pollution keys from plain objects / arrays.
 *
 * Copy-on-write: when a subtree contains no dangerous key the original
 * reference is returned untouched, so the common (clean) case allocates
 * nothing. Non-plain values (Date, Map, Set, class instances, primitives, ...)
 * are returned as-is so superjson keeps handling their special types.
 */
const stripPrototypePollution = (value: unknown, seen: WeakSet<object>): unknown => {
  if (Array.isArray(value)) {
    let result: unknown[] | undefined;
    for (let i = 0; i < value.length; i++) {
      const sanitized = stripPrototypePollution(value[i], seen);
      if (sanitized !== value[i] && !result) result = value.slice(0, i);
      if (result) result.push(sanitized);
    }
    return result ?? value;
  }

  if (isPlainObject(value)) {
    // guard against the (unrealistic for JSON-derived data) circular reference
    if (seen.has(value)) return value;
    seen.add(value);

    const keys = Object.keys(value);
    let result: Record<string, unknown> | undefined;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const dangerous = DANGEROUS_KEYS.has(key);
      const sanitized = dangerous ? undefined : stripPrototypePollution(value[key], seen);

      // first divergence -> lazily clone the keys seen so far
      if ((dangerous || sanitized !== value[key]) && !result) {
        result = {};
        for (let j = 0; j < i; j++) result[keys[j]] = value[keys[j]];
      }

      if (result && !dangerous) result[key] = sanitized;
    }

    return result ?? value;
  }

  return value;
};

/**
 * Drop-in replacement for the bare `superjson` tRPC transformer that is
 * resilient to prototype-pollution keys in procedure output. Use this anywhere
 * `transformer: superjson` was previously passed.
 */
export const transformer = {
  deserialize: superjson.deserialize,
  serialize: (object: unknown) => superjson.serialize(stripPrototypePollution(object, new WeakSet())),
};
