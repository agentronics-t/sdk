const REDACTED = '[REDACTED]'

const cloneJson = (value: unknown): unknown => {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as unknown
}

const redactPath = (target: unknown, parts: string[]): void => {
  if (parts.length === 0 || typeof target !== 'object' || target === null) return
  const [head, ...rest] = parts
  if (!head) return

  if (Array.isArray(target)) {
    for (const item of target) redactPath(item, parts)
    return
  }

  const record = target as Record<string, unknown>
  if (!(head in record)) return
  if (rest.length === 0) {
    record[head] = REDACTED
    return
  }
  redactPath(record[head], rest)
}

export const scrubValue = <T>(value: T, paths: string[] = []): T => {
  if (paths.length === 0) return value
  const cloned = cloneJson(value) as T
  for (const path of paths) redactPath(cloned, path.split('.').filter(Boolean))
  return cloned
}

export const DEFAULT_SCRUB_PATHS = [
  'metadata.password',
  'metadata.token',
  'metadata.authorization',
  'metadata.cookie',
]
