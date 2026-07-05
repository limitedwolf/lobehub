import type { BuiltinManifestResolver, BuiltinToolResolveContext } from '@lobechat/types';

import { SkillsManifest } from './manifest';
import { SkillsApiName } from './types';

/**
 * The exec-class APIs whose runtime is the server-side cloud sandbox
 * (`apps/server/.../serverRuntimes/skills.ts`), regardless of the run's
 * execution target. Their static descriptions never say where they run, so a
 * desktop user who picked "local device" can have commands silently land in
 * the sandbox — most damagingly when the bound device is judged offline and
 * `lobe-local-system` is not injected at all (plan kind `device-unrouted`).
 */
const EXEC_API_NAMES = new Set<string>([
  SkillsApiName.execScript,
  SkillsApiName.exportFile,
  SkillsApiName.runCommand,
]);

/**
 * Per-environment description preambles for the exec-class APIs. Descriptions
 * carry tool semantics only (where it runs, what credentials it has);
 * cross-tool arbitration lives in `EXEC_ENV_FACTS`.
 *
 * - `device`: a local device is online — the sandbox is the FALLBACK.
 *   Credential fact: `injectCredsToSandbox` only injects into the sandbox;
 *   devices deliberately get nothing.
 * - `device-unrouted`: the user chose their local device but it is offline —
 *   the model must disclose the degradation instead of silently running
 *   machine-specific commands in the sandbox.
 * - `sandbox`: explicit sandbox target — current semantics, just made
 *   unambiguous that it is not the user's machine.
 *
 * `local` / `none` (and no context) keep the static manifest untouched.
 */
const EXEC_ENV_PREAMBLES: Partial<
  Record<NonNullable<BuiltinToolResolveContext['executionEnv']>, string>
> = {
  'device':
    "Fallback execution environment: an isolated cloud sandbox, not the user's machine (LobeHub-managed credentials injected, e.g. `GITHUB_TOKEN`).",
  'device-unrouted':
    'Fallback execution environment: an isolated cloud sandbox. The user chose their local device but it is offline — say so before running commands that assume their machine.',
  'sandbox': "Execution environment: an isolated cloud sandbox, not the user's machine.",
};

/**
 * Environment facts appended to the tool systemRole. Cross-tool arbitration
 * (which runCommand to default to) belongs here, not in the API descriptions:
 * descriptions get skimmed once the tool list is long, and a "prefer the
 * other tool" rule written on the tool NOT to pick is read too late — only
 * when the model is already considering it.
 */
const EXEC_ENV_FACTS: Partial<
  Record<NonNullable<BuiltinToolResolveContext['executionEnv']>, string>
> = {
  'device':
    'A local device is online. Default shell execution to `lobe-local-system` runCommand; use the skills exec APIs only when the local run lacks a required tool, the task needs LobeHub-managed credentials, or the task needs isolation.',
  'device-unrouted': 'Bound device offline; shell commands execute in the cloud sandbox this run.',
};

/**
 * Context-aware manifest for the lobe-skills tool: prefixes the exec-class API
 * descriptions with where they actually run, derived from the resolved
 * execution plan (see `BuiltinToolResolveContext.executionEnv`).
 */
export const resolveSkillsManifest: BuiltinManifestResolver = (context) => {
  const preamble = context.executionEnv && EXEC_ENV_PREAMBLES[context.executionEnv];
  if (!preamble) return SkillsManifest;

  const fact = context.executionEnv && EXEC_ENV_FACTS[context.executionEnv];

  return {
    ...SkillsManifest,
    api: SkillsManifest.api.map((api) =>
      EXEC_API_NAMES.has(api.name)
        ? { ...api, description: `${preamble} ${api.description}` }
        : api,
    ),
    ...(fact && {
      systemRole: `${SkillsManifest.systemRole}\n<execution_environment>\n${fact}\n</execution_environment>\n`,
    }),
  };
};
