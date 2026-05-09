import { Hono } from 'hono'
import type { Storage } from '../storage/types.js'

export const createSignatureRoutes = ({ storage }: { storage: Storage }) => {
  const app = new Hono()

  app.get('/v1/detector-signatures', async (c) => {
    const document = await storage.signatures.current()
    const ifNoneMatch = c.req.header('if-none-match')
    if (ifNoneMatch && ifNoneMatch === document.etag) {
      c.header('etag', document.etag)
      c.header('cache-control', 'public, max-age=300')
      return c.body(null, 304)
    }
    c.header('etag', document.etag)
    c.header('cache-control', 'public, max-age=300')
    return c.json({ signatures: document.signatures })
  })

  return app
}
