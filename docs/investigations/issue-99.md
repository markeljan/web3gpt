# Issue 99: localStorage warning investigation

No application fix is established. The supplied event has no application stack,
Node version, flags or deployment revision. Do not infer a wallet defect from
request correlation alone.

The HTML layout imports Web3Provider, which imports the module-level wagmiConfig.
That config creates RainbowKit connectors, enables SSR, and uses cookieStorage.
This is a candidate import path, not a traced cause. The explicit browser storage
hook in lib/hooks/use-local-storage.ts accesses window.localStorage from effects
and callbacks. No triggering bundled frame could be mapped from the supplied event.

Local verification (2026-11-12):

- bun install --frozen-lockfile succeeded.
- bun run lint && bun run typecheck && bun run test succeeded: 223 tests passed.
- bun run build compiled and typechecked, then failed collecting page data for
  /api/chat: missing/default BETTER_AUTH_SECRET and an invalid wallet private key.
- Node v24.22.1 reports typeof globalThis.localStorage as undefined by default.
  With --experimental-webstorage, accessing it without a file throws TypeError
  and emits a different experimental Web Storage warning. This does not reproduce
  the production warning and cannot validate a fix for that runtime.

No production-like HTML or markdown request was verified because the production
build failed. No regression test was added because the failing access is unknown.
No storage polyfill, warning suppression or speculative SSR change was made.

## Compose comment for actor codex-harness

Investigation incomplete; no safe code fix identified. Required checks pass (223
 tests). Local production build is blocked by unavailable auth/wallet configuration.
The available Node v24.22.1 does not reproduce the reported warning semantics.
Deployment owner: provide the affected deployment's source revision, exact Node
version and runtime flags, and sanitized startup/request stderr from a fresh process
with --trace-warnings (without --localstorage-file), including a full first-access
stack and source maps. Reproduce HTML GET / and markdown Accept requests separately.
Provide approved build configuration through the deployment environment, not an
issue comment. Map the first access to its module before choosing a dependency or
SSR integration fix. This is an evidence gap, not a confirmed external cause;
keep issue 99 open pending reproduction and subsequent deployment monitoring.
