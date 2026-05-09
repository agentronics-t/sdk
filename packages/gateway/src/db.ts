import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

let cached: NeonQueryFunction<false, false> | null = null

export const getSql = (databaseUrl: string | undefined) => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Configure a Neon connection string before querying.')
  }
  if (!cached) {
    cached = neon(databaseUrl)
  }
  return cached
}

export const pingDatabase = async (databaseUrl: string | undefined): Promise<boolean> => {
  if (!databaseUrl) return false
  try {
    const sql = getSql(databaseUrl)
    const result = await sql`SELECT 1 AS ok`
    return result[0]?.ok === 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[agentronics:gateway] pingDatabase failed: ${message}`)
    return false
  }
}
