export interface DetectorSignature {
  id: string
  status: 'stable' | 'beta' | 'research'
  version: string
  signals: Record<string, unknown>
}

export interface SignatureLoaderOptions {
  gatewayUrl: string
  fetcher?: typeof fetch
}

export const createSignatureLoader = ({ gatewayUrl, fetcher = fetch }: SignatureLoaderOptions) => {
  let etag: string | null = null
  let signatures: DetectorSignature[] = []

  return {
    snapshot(): DetectorSignature[] {
      return [...signatures]
    },
    async sync(): Promise<DetectorSignature[]> {
      const response = await fetcher(`${gatewayUrl.replace(/\/$/, '')}/v1/detector-signatures`, {
        headers: etag ? { 'if-none-match': etag } : {},
      })
      if (response.status === 304) return this.snapshot()
      if (!response.ok) throw new Error(`Detector signature sync failed with status ${response.status}.`)

      const body = (await response.json()) as { signatures?: DetectorSignature[] }
      signatures = body.signatures ?? []
      etag = response.headers.get('etag')
      return this.snapshot()
    },
  }
}

export type SignatureLoader = ReturnType<typeof createSignatureLoader>
