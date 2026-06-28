import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, when, ago } from '../api';
import type { ApiKey } from '../types';
import { useResource } from '../hooks';
import { PageHeader, Spinner, ErrorBox, Empty, Table, Btn, Modal, Input, Notice } from '../components/ui';

// Common CPMS scopes offered when minting a key. Managing keys (create/revoke) and any write/command
// scope may be off-by-default for non-Admin operators — the API answers 403, surfaced as a Notice.
const SCOPE_GROUPS: { label: string; scopes: string[] }[] = [
  { label: 'Read', scopes: ['cpms:read:chargers', 'cpms:read:sessions', 'cpms:read:transactions', 'cpms:read:locations', 'cpms:read:tariffs', 'cpms:read:analytics', 'cpms:read:webhooks'] },
  { label: 'Write', scopes: ['cpms:write:chargers', 'cpms:write:locations', 'cpms:write:tariffs', 'cpms:write:sessions', 'cpms:write:webhooks'] },
  { label: 'Command (live OCPP)', scopes: ['cpms:command:chargers'] },
];

const scopeHint = (e: ApiError): string => (e.status === 403 ? ' — needs cpms:write:api-keys (admin) / off by default' : '');

// prefix…suffix preview of an otherwise hashed key.
function maskKey(k: ApiKey): string {
  const prefix = (k.prefix ?? '').trim();
  const suffix = (k.suffix ?? '').trim();
  if (prefix && suffix) return `${prefix}…${suffix}`;
  if (prefix) return `${prefix}…`;
  if (suffix) return `…${suffix}`;
  return '—';
}

// The one-time plaintext secret comes back under a few possible field names.
function extractSecret(res: unknown): string | undefined {
  const o = (res ?? {}) as Record<string, unknown>;
  for (const k of ['key', 'secret', 'apiKey', 'plaintext', 'fullKey', 'token', 'value', 'rawKey']) {
    const v = o[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

export function ApiKeys() {
  const network = useNetwork();

  const keysRes = useResource(() => api.apiKeys(network), [network], !!network);
  const keys = keysRes.data?.data ?? [];

  // Create modal.
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<string[]>([]);

  // Revoke confirm.
  const [delTarget, setDelTarget] = useState<ApiKey | null>(null);

  // One-time plaintext secret returned on create.
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  function openCreate() {
    setNewName('');
    setNewScopes([]);
    setActionErr(null);
    setShowCreate(true);
  }
  const toggleScope = (s: string) => setNewScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { setActionErr('A key name is required.'); return; }
    if (newScopes.length === 0) { setActionErr('Select at least one scope.'); return; }
    setBusy(true);
    setActionErr(null);
    try {
      const res = await api.createApiKey(network, { name, scopes: newScopes });
      const secret = extractSecret(res);
      setShowCreate(false);
      setCreatedSecret(secret ?? null);
      setCopied(false);
      setNotice(secret ? null : { tone: 'ok', msg: 'API key created (secret not returned by server).' });
      keysRes.reload();
    } catch (err) {
      setActionErr(err instanceof ApiError ? `${err.message}${scopeHint(err)}` : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!delTarget) return;
    setBusy(true);
    setActionErr(null);
    try {
      await api.deleteApiKey(network, delTarget.id);
      setDelTarget(null);
      setNotice({ tone: 'ok', msg: 'API key revoked.' });
      keysRes.reload();
    } catch (e) {
      setActionErr(e instanceof ApiError ? `${e.message}${scopeHint(e)}` : 'Revoke failed.');
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!createdSecret) return;
    navigator.clipboard?.writeText(createdSecret)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  }

  const createBtn = <Btn variant="primary" onClick={openCreate} disabled={!network}>Create key</Btn>;

  return (
    <>
      <PageHeader title="API keys" sub="GET·POST·DELETE /cpms/v1/api-keys · X-Network-Id = active network" right={createBtn} />

      {createdSecret && (
        <div className="mb-4">
          <Notice tone="ok">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">Secret key — copy now, it is shown once and cannot be retrieved again.</p>
                <p className="mt-1 mono break-all">{createdSecret}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Btn size="sm" onClick={copySecret}>{copied ? 'Copied' : 'Copy'}</Btn>
                <Btn size="sm" onClick={() => setCreatedSecret(null)}>Dismiss</Btn>
              </div>
            </div>
          </Notice>
        </div>
      )}

      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {!network ? (
        <Empty msg="Select a network to continue." />
      ) : keysRes.loading ? (
        <Spinner label="Loading API keys…" />
      ) : keysRes.error ? (
        <ErrorBox error={keysRes.error} />
      ) : keys.length === 0 ? (
        <Empty msg="No API keys for this network yet. Create one to start calling the CPMS API." />
      ) : (
        <Table
          numeric={[2]}
          columns={['Name', 'Key', 'Scopes', 'Last used', 'Created', '']}
          rows={keys.map((k) => [
            <span className="font-medium">{k.name ?? '—'}</span>,
            <span className="mono">{maskKey(k)}</span>,
            <span title={(k.scopes ?? []).join('\n')}>{k.scopes?.length ?? 0}</span>,
            k.lastUsedAt ? ago(k.lastUsedAt) : <span className="text-[color:var(--color-ink-soft)]">never</span>,
            when(k.createdAt),
            <div className="flex justify-end">
              <Btn variant="danger" size="sm" onClick={() => { setActionErr(null); setDelTarget(k); }}>Revoke</Btn>
            </div>,
          ])}
        />
      )}

      {showCreate && (
        <Modal title="Create API key" onClose={() => setShowCreate(false)}>
          <form onSubmit={submitCreate} className="space-y-4">
            <p className="text-xs text-[color:var(--color-ink-soft)]">
              <span className="mono">POST /cpms/v1/api-keys</span>
            </p>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">Name</label>
              <Input
                placeholder="e.g. Billing integration (prod)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[color:var(--color-ink)]">
                Scopes {newScopes.length > 0 && <span className="text-[color:var(--color-ink-soft)]">({newScopes.length} selected)</span>}
              </label>
              <div className="max-h-64 space-y-3 overflow-y-auto scroll-thin rounded-lg border border-black/10 p-3">
                {SCOPE_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-soft)]">{g.label}</p>
                    <div className="space-y-0.5">
                      {g.scopes.map((s) => (
                        <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/[0.03]">
                          <input type="checkbox" checked={newScopes.includes(s)} onChange={() => toggleScope(s)} />
                          <span className="mono">{s}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-soft)]">Grant only what the integration needs. Write/command scopes may require an admin role.</p>
            </div>

            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="primary" type="submit" loading={busy}>Create key</Btn>
            </div>
          </form>
        </Modal>
      )}

      {delTarget && (
        <Modal title="Revoke API key" onClose={() => setDelTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm">
              Permanently revoke <span className="font-semibold">{delTarget.name ?? 'this key'}</span>{' '}
              (<span className="mono break-all">{maskKey(delTarget)}</span>)? Any client using it will immediately get 401. This cannot be undone.
            </p>
            {actionErr && <p className="text-sm font-medium text-red-700">{actionErr}</p>}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelTarget(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmRevoke} loading={busy}>Revoke key</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
