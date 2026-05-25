// Single source of truth for the SDK build version, surfaced on every
// AgentIdentity as `detectionVersion` so traces can be filtered by SDK
// generation. tsup inlines a pkg-version replacement at build time;
// the literal here is the dev/test fallback. Bump this when you cut a
// new SDK release.
export const SDK_VERSION = '0.1.2'
