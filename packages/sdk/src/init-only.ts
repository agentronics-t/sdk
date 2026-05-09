// Tree-shake budget probe. Bundles only what `Agentronics.init` actually
// reaches transitively, so size-limit catches accidental graph bloat (eager
// imports, side-effect modules, leaking optional deps). The lite path
// (`@agentronics/sdk/lite`) is the small WebMCP-only init surface.
export { init } from './init.js'
export type { InitOptions, AgentronicsClient } from './init.js'
