import Link from 'next/link'
import { notFound } from 'next/navigation'
import { gatewayJson } from '../../../lib/gateway'
import { Card } from '../../ui/Card'
import {
  deleteProtocolConfigAction,
  upsertMtlsConfigAction,
  upsertSpiffeConfigAction,
  upsertSsoConfigAction,
} from './actions'

interface ProtocolConfigRecord {
  id: string
  siteId: string
  protocol: 'sso' | 'spiffe' | 'mtls'
  config: Record<string, unknown>
  createdAt: string
}

interface ConfigsResponse {
  configs: ProtocolConfigRecord[]
}

interface SitesResponse {
  sites: Array<{ id: string; name: string; createdAt: string }>
}

const inputStyle = {
  padding: '6px 8px',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  fontSize: 13,
  width: '100%',
  fontFamily: 'inherit',
} as const

const textareaStyle = {
  ...inputStyle,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  minHeight: 120,
} as const

const labelStyle = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
} as const

const labelText = { color: 'var(--text-muted)' } as const

const saveBtn = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid var(--accent)',
  background: 'var(--accent)',
  color: 'var(--accent-fg)',
  fontWeight: 600,
  cursor: 'pointer',
} as const

const deleteBtn = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-elevated)',
  color: 'var(--danger)',
  cursor: 'pointer',
} as const

const ConfigStatus = ({ configured }: { configured: boolean }) => (
  <span
    style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 999,
      background: configured ? 'var(--success-bg, transparent)' : 'transparent',
      color: configured ? 'var(--success)' : 'var(--text-muted)',
      border: `1px solid ${configured ? 'var(--success)' : 'var(--border)'}`,
    }}
  >
    {configured ? 'configured' : 'not configured'}
  </span>
)

const ProtocolAction = ({
  configured,
  siteId,
  protocol,
}: {
  configured: boolean
  siteId: string
  protocol: 'sso' | 'spiffe' | 'mtls'
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <ConfigStatus configured={configured} />
    {configured && (
      <form action={deleteProtocolConfigAction}>
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="protocol" value={protocol} />
        <button type="submit" style={{ ...deleteBtn, padding: '4px 10px', fontSize: 12 }}>
          Clear config
        </button>
      </form>
    )}
  </div>
)

export default async function SiteDetailPage(props: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await props.params

  // Confirm the site exists + belongs to us. /v1/sites returns 200 with []
  // for empty orgs, so this is a check we have to do.
  const sitesList = await gatewayJson<SitesResponse>('/v1/sites').catch(
    () => ({ sites: [] as SitesResponse['sites'] })
  )
  const site = sitesList.sites.find((s) => s.id === siteId)
  if (!site) notFound()

  const list = await gatewayJson<ConfigsResponse>(
    `/v1/sites/${encodeURIComponent(siteId)}/protocol-config`
  ).catch(() => ({ configs: [] as ProtocolConfigRecord[] }))

  const byProtocol = new Map(list.configs.map((c) => [c.protocol, c]))
  const sso = byProtocol.get('sso')?.config as
    | { issuer?: string; audiences?: string[] }
    | undefined
  const spiffe = byProtocol.get('spiffe')?.config as
    | {
        trustDomain?: string
        bundleEndpoint?: string
        audiences?: string[]
        googleTrustDomains?: string[]
      }
    | undefined
  const mtls = byProtocol.get('mtls')?.config as
    | { rootCerts?: string[]; spiffeTrustDomain?: string; xfccEntryPolicy?: string }
    | undefined

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <Link href="/sites" style={{ color: 'var(--text-muted)' }}>
            ← All sites
          </Link>
        </div>
        <h1 style={{ margin: '4px 0 0 0' }}>{site.name}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          Site ID: <code>{site.id}</code> · Configure how this site verifies enterprise auth
          protocols. Empty config = protocol not accepted for this site.
        </p>
      </header>

      <Card
        title="SSO (OIDC ID tokens)"
        action={<ProtocolAction configured={Boolean(sso)} siteId={site.id} protocol="sso" />}
      >
        <form action={upsertSsoConfigAction} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="siteId" value={site.id} />
          <label style={labelStyle}>
            <span style={labelText}>Issuer URL</span>
            <input
              name="issuer"
              type="url"
              required
              defaultValue={sso?.issuer ?? ''}
              placeholder="https://acme.okta.com"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Audiences (comma‑separated)</span>
            <input
              name="audiences"
              type="text"
              required
              defaultValue={(sso?.audiences ?? []).join(', ')}
              placeholder={`agentronics:${site.id}`}
              style={inputStyle}
            />
          </label>
          <div>
            <button type="submit" style={saveBtn}>
              Save SSO config
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="SPIFFE (workload JWT‑SVIDs)"
        action={
          <ProtocolAction configured={Boolean(spiffe)} siteId={site.id} protocol="spiffe" />
        }
      >
        <form action={upsertSpiffeConfigAction} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="siteId" value={site.id} />
          <label style={labelStyle}>
            <span style={labelText}>Trust domain</span>
            <input
              name="trustDomain"
              type="text"
              required
              defaultValue={spiffe?.trustDomain ?? ''}
              placeholder="prod.acme.example"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>SPIFFE Bundle endpoint URL</span>
            <input
              name="bundleEndpoint"
              type="url"
              required
              defaultValue={spiffe?.bundleEndpoint ?? ''}
              placeholder="https://spire.acme.example/bundle"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>Audiences (comma‑separated)</span>
            <input
              name="audiences"
              type="text"
              required
              defaultValue={(spiffe?.audiences ?? []).join(', ')}
              placeholder={`agentronics:${site.id}`}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>
              Google trust domains (comma‑separated, optional) — agents from these GCP project trust
              domains get relabeled as <code>google-agent</code>
            </span>
            <input
              name="googleTrustDomains"
              type="text"
              defaultValue={(spiffe?.googleTrustDomains ?? []).join(', ')}
              placeholder="acme-prod.svc.id.goog"
              style={inputStyle}
            />
          </label>
          <div>
            <button type="submit" style={saveBtn}>
              Save SPIFFE config
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="mTLS (XFCC from your edge)"
        action={<ProtocolAction configured={Boolean(mtls)} siteId={site.id} protocol="mtls" />}
      >
        <form action={upsertMtlsConfigAction} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="siteId" value={site.id} />
          <label style={labelStyle}>
            <span style={labelText}>
              Root CAs (PEM blocks separated by blank lines) — the issuers your edge proxy validates
              client certs against
            </span>
            <textarea
              name="rootCerts"
              required
              defaultValue={(mtls?.rootCerts ?? []).join('\n\n')}
              placeholder={'-----BEGIN CERTIFICATE-----\nMIIDxxxxxxxxx\n-----END CERTIFICATE-----'}
              style={textareaStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>SPIFFE trust domain (optional) — restricts X.509‑SVIDs</span>
            <input
              name="spiffeTrustDomain"
              type="text"
              defaultValue={mtls?.spiffeTrustDomain ?? ''}
              placeholder="prod.acme.example"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={labelText}>XFCC entry policy</span>
            <select
              name="xfccEntryPolicy"
              defaultValue={mtls?.xfccEntryPolicy ?? 'last'}
              style={inputStyle}
            >
              <option value="last">last (default — safe with SANITIZE_SET at edge)</option>
              <option value="first">first (only for fully mesh‑verified chains)</option>
              <option value="only">only (strictest — rejects multi‑entry headers)</option>
            </select>
          </label>
          <div>
            <button type="submit" style={saveBtn}>
              Save mTLS config
            </button>
          </div>
        </form>
      </Card>
    </section>
  )
}
