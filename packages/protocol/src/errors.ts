export type AgentronicsErrorCode =
  | 'invalid_api_key'
  | 'wrong_key_kind'
  | 'policy_denied'
  | 'tool_unknown'
  | 'rate_limited'
  | 'internal_error'

export class AgentronicsError extends Error {
  readonly code: AgentronicsErrorCode

  constructor(code: AgentronicsErrorCode, message: string) {
    super(message)
    this.name = 'AgentronicsError'
    this.code = code
  }
}
