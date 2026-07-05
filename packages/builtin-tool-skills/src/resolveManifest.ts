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
 * Per-environment description preambles for the exec-class APIs.
 *
 * - `device`: a local device is online — the sandbox is the FALLBACK, local
 *   execution is the default. Credential fact: `injectCredsToSandbox` only
 *   injects into the sandbox; devices deliberately get nothing.
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
    "Fallback execution environment: an isolated cloud sandbox, not the user's machine. Default to `lobe-local-system` runCommand; fall back here when the local run fails for a missing tool or credential (the sandbox has LobeHub-managed credentials injected, e.g. `GITHUB_TOKEN`), or the task needs isolation.",
  'device-unrouted':
    'Fallback execution environment: an isolated cloud sandbox. The user chose their local device but it is offline — say so before running commands that assume their machine.',
  'sandbox': "Execution environment: an isolated cloud sandbox, not the user's machine.",
};

/**
 * Environment fact appended to the tool systemRole when the run degraded from
 * a bound device to the sandbox. The API-description preamble alone can be
 * skimmed over once the tool list is long; this line rides the tool system
 * role into the prompt so the degradation is stated as run state, not tool
 * fine print.
 */
const DEVICE_OFFLINE_FACT =
  'Bound device offline; shell commands execute in the cloud sandbox this run.';

/**
 * Context-aware manifest for the lobe-skills tool: prefixes the exec-class API
 * descriptions with where they actually run, derived from the resolved
 * execution plan (see `BuiltinToolResolveContext.executionEnv`).
 */
export const resolveSkillsManifest: BuiltinManifestResolver = (context) => {
  const preamble = context.executionEnv && EXEC_ENV_PREAMBLES[context.executionEnv];
  if (!preamble) return SkillsManifest;

  return {
    ...SkillsManifest,
    api: SkillsManifest.api.map((api) =>
      EXEC_API_NAMES.has(api.name)
        ? { ...api, description: `${preamble} ${api.description}` }
        : api,
    ),
    ...(context.executionEnv === 'device-unrouted' && {
      systemRole: `${SkillsManifest.systemRole}\n<execution_environment>\n${DEVICE_OFFLINE_FACT}\n</execution_environment>\n`,
    }),
  };
};
