import { describe, expect, it } from 'vitest';

import { SkillsManifest } from './manifest';
import { resolveSkillsManifest } from './resolveManifest';
import { systemPrompt } from './systemRole';
import { SkillsApiName } from './types';

const EXEC_APIS = [SkillsApiName.runCommand, SkillsApiName.execScript, SkillsApiName.exportFile];
const NON_EXEC_APIS = [SkillsApiName.activateSkill, SkillsApiName.readReference];

const apiByName = (manifest: { api: { description: string; name: string }[] }, name: string) =>
  manifest.api.find((a) => a.name === name)!;

describe('resolveSkillsManifest', () => {
  it('returns the static manifest reference when no executionEnv is set', () => {
    expect(resolveSkillsManifest({})).toBe(SkillsManifest);
    expect(resolveSkillsManifest({ isSubAgent: true, scope: 'main' })).toBe(SkillsManifest);
  });

  it.each(['local', 'none'] as const)(
    'returns the static manifest reference for executionEnv %s',
    (executionEnv) => {
      expect(resolveSkillsManifest({ executionEnv })).toBe(SkillsManifest);
    },
  );

  it('prefixes exec APIs with the fallback framing when a device is online', () => {
    const result = resolveSkillsManifest({ executionEnv: 'device' })!;

    for (const name of EXEC_APIS) {
      const description = apiByName(result, name).description;
      expect(description).toMatch(/^Fallback execution environment: an isolated cloud sandbox/);
      expect(description).toContain('GITHUB_TOKEN');
      // the original mechanics stay after the preamble
      expect(description).toContain(apiByName(SkillsManifest, name).description);
    }
    // cross-tool arbitration rides the tool systemRole, not the descriptions
    expect(result.systemRole).toContain(systemPrompt);
    expect(result.systemRole).toContain(
      'Default shell execution to `lobe-local-system` runCommand',
    );
  });

  it('warns about the offline device and appends the environment fact when device-unrouted', () => {
    const result = resolveSkillsManifest({ executionEnv: 'device-unrouted' })!;

    for (const name of EXEC_APIS) {
      const description = apiByName(result, name).description;
      expect(description).toMatch(/^Fallback execution environment: an isolated cloud sandbox/);
      expect(description).toContain('local device but it is offline');
    }
    // the offline fact rides the tool systemRole into the prompt
    expect(result.systemRole).toContain(systemPrompt);
    expect(result.systemRole).toContain(
      'Bound device offline; shell commands execute in the cloud sandbox this run.',
    );
  });

  it('clarifies the sandbox location for an explicit sandbox target', () => {
    const result = resolveSkillsManifest({ executionEnv: 'sandbox' })!;

    for (const name of EXEC_APIS) {
      const description = apiByName(result, name).description;
      expect(description).toMatch(
        /^Execution environment: an isolated cloud sandbox, not the user's machine\./,
      );
    }
    expect(result.systemRole).toBe(systemPrompt);
  });

  it.each(['device', 'device-unrouted', 'sandbox'] as const)(
    'keeps non-exec APIs, api shape, and humanIntervention intact for %s',
    (executionEnv) => {
      const result = resolveSkillsManifest({ executionEnv })!;

      expect(result.api.map((a) => a.name)).toEqual(SkillsManifest.api.map((a) => a.name));
      for (const name of NON_EXEC_APIS) {
        expect(apiByName(result, name)).toBe(apiByName(SkillsManifest, name));
      }
      for (const name of [SkillsApiName.runCommand, SkillsApiName.execScript]) {
        expect(apiByName(result, name).humanIntervention).toBe('required');
      }
      expect(result.identifier).toBe(SkillsManifest.identifier);
    },
  );

  it('does not mutate the static manifest', () => {
    const staticDescriptions = SkillsManifest.api.map((a) => a.description);

    resolveSkillsManifest({ executionEnv: 'device-unrouted' });

    expect(SkillsManifest.api.map((a) => a.description)).toEqual(staticDescriptions);
    expect(SkillsManifest.systemRole).toBe(systemPrompt);
  });
});
