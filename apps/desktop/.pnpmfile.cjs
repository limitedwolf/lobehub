/**
 * pnpm install hook.
 *
 * Drops `@anthropic-ai/claude-agent-sdk`'s optional platform-binary deps
 * (`claude-agent-sdk-{darwin,linux,win32}-{arm64,x64,x64-musl,arm64-musl}`,
 * each ~200MB). The desktop app spawns the system-installed `claude` via
 * `pathToClaudeCodeExecutable`, so the bundled binary is never used at
 * runtime — pulling it would just bloat dev installs.
 */
function readPackage(pkg) {
  if (pkg.name === '@anthropic-ai/claude-agent-sdk' && pkg.optionalDependencies) {
    pkg.optionalDependencies = {};
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
