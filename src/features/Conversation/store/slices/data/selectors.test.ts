import { describe, expect, it } from 'vitest';

import { type State } from '../../initialState';
import { dataSelectors } from './selectors';

const stateWith = (dbMessages: any[]): State => ({ dbMessages } as unknown as State);

describe('dataSelectors.getRetryScopeId', () => {
  it('returns the direct user parent for a first-attempt assistant turn', () => {
    const state = stateWith([
      { id: 'user-1', role: 'user', parentId: undefined },
      { id: 'asst-1', role: 'assistant', parentId: 'user-1' },
    ]);

    expect(dataSelectors.getRetryScopeId('asst-1')(state)).toBe('user-1');
  });

  it('walks multiple assistant blocks up to the owning user message', () => {
    const state = stateWith([
      { id: 'user-1', role: 'user', parentId: undefined },
      { id: 'block-1', role: 'assistant', parentId: 'user-1' },
      { id: 'block-2', role: 'assistant', parentId: 'block-1' },
    ]);

    expect(dataSelectors.getRetryScopeId('block-2')(state)).toBe('user-1');
  });

  it('stays anchored on the user message across a continue chain (stable retry scope)', () => {
    // A hidden overload "continue" chains each new turn off the prior block, so
    // the scope must walk all the way back to the single user message — otherwise
    // the auto-retry budget would reset every continuation.
    const state = stateWith([
      { id: 'user-1', role: 'user', parentId: undefined },
      { id: 'block-1', role: 'assistant', parentId: 'user-1' },
      { id: 'continue-1', role: 'assistant', parentId: 'block-1' },
      { id: 'continue-2', role: 'assistant', parentId: 'continue-1' },
    ]);

    expect(dataSelectors.getRetryScopeId('continue-2')(state)).toBe('user-1');
  });

  it('returns undefined when no user ancestor exists', () => {
    const state = stateWith([{ id: 'orphan', role: 'assistant', parentId: undefined }]);

    expect(dataSelectors.getRetryScopeId('orphan')(state)).toBeUndefined();
  });

  it('does not loop forever on a cyclic parent chain', () => {
    const state = stateWith([
      { id: 'a', role: 'assistant', parentId: 'b' },
      { id: 'b', role: 'assistant', parentId: 'a' },
    ]);

    expect(dataSelectors.getRetryScopeId('a')(state)).toBeUndefined();
  });
});
