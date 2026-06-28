import { useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError, when } from '../api';
import { useResource } from '../hooks';
import type { TeamMember } from '../types';
import {
  PageHeader, Card, Spinner, ErrorBox, Empty, Table, Btn, Modal,
  Field, Input, Select, Notice, StatusPill,
} from '../components/ui';

const ROLES = ['Admin', 'Manager', 'TechSupport', 'Viewer'];

export function Team() {
  const network = useNetwork();
  const members = useResource(() => api.team(network), [network], !!network);

  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  // add-member form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Viewer');
  const [savingAdd, setSavingAdd] = useState(false);

  // inline role change + remove busy tracking (by member id)
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const errMsg = (e: unknown) =>
    e instanceof ApiError
      ? e.code === 'user_not_found'
        ? 'user_not_found — the user must already exist on the platform.'
        : e.status === 403
          ? `${e.message} (needs cpms:write:team / off by default)`
          : `${e.code}: ${e.message}`
      : String(e);

  async function changeRole(m: TeamMember, next: string) {
    if (!network || next === (m.role ?? '')) return;
    setBusyId(m.id); setNotice(null);
    try {
      await api.updateTeam(network, m.id, { role: next });
      setNotice({ tone: 'ok', msg: `Updated role for ${m.email ?? m.id} to ${next}.` });
      members.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: errMsg(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function addMember() {
    if (!network) return;
    setSavingAdd(true); setNotice(null);
    try {
      await api.addTeam(network, { email: email.trim(), role });
      setNotice({ tone: 'ok', msg: `Invited ${email.trim()} as ${role}.` });
      setAdding(false); setEmail(''); setRole('Viewer');
      members.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: errMsg(e) });
    } finally {
      setSavingAdd(false);
    }
  }

  async function confirmRemove() {
    if (!network || !removing) return;
    setRemoveBusy(true); setNotice(null);
    try {
      await api.removeTeam(network, removing.id);
      setNotice({ tone: 'ok', msg: `Removed ${removing.email ?? removing.id}.` });
      setRemoving(null);
      members.reload();
    } catch (e) {
      setNotice({ tone: 'bad', msg: errMsg(e) });
    } finally {
      setRemoveBusy(false);
    }
  }

  const header = (
    <PageHeader
      title="Team"
      sub="GET·POST·PUT·DELETE /cpms/v1/team"
      right={network ? <Btn variant="primary" onClick={() => { setAdding(true); setNotice(null); }}>Add member</Btn> : undefined}
    />
  );

  if (!network) return <>{header}<Empty msg="Select a network." /></>;

  const rows = (members.data?.data ?? []).map((m) => [
    <span className="font-medium">{m.name ?? '—'}</span>,
    <span className="mono">{m.email ?? '—'}</span>,
    <div className="flex items-center gap-2">
      <Select value={m.role ?? ''} onChange={(v) => changeRole(m, v)} className="py-1">
        {!m.role && <option value="">—</option>}
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
      {busyId === m.id && <Spinner label="" />}
    </div>,
    <Btn variant="danger" size="sm" onClick={() => { setRemoving(m); setNotice(null); }}>Remove</Btn>,
  ]);

  return (
    <>
      {header}
      {notice && <div className="mb-4"><Notice tone={notice.tone}>{notice.msg}</Notice></div>}

      {members.loading ? (
        <Spinner />
      ) : members.error ? (
        <ErrorBox error={members.error} />
      ) : rows.length === 0 ? (
        <Empty msg="No team members yet. Add one to grant console access." />
      ) : (
        <Table columns={['Name', 'Email', 'Role', '']} rows={rows} />
      )}

      {adding && (
        <Modal title="Add team member" onClose={() => !savingAdd && setAdding(false)}>
          <div className="space-y-4">
            <Notice tone="info">
              The user must already exist on the platform — the API returns <span className="mono">user_not_found</span> otherwise.
            </Notice>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@example.com" autoFocus />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={setRole}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setAdding(false)} disabled={savingAdd}>Cancel</Btn>
              <Btn variant="primary" loading={savingAdd} disabled={!email.trim()} onClick={addMember}>Add member</Btn>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal title="Remove team member" onClose={() => !removeBusy && setRemoving(null)}>
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--color-ink-soft)]">
              Remove <span className="mono">{removing.email ?? removing.id}</span>
              {removing.role && <> (<StatusPill value={removing.role} />)</>} from this network? They will lose console access immediately.
            </p>
            <Card className="p-4 text-sm">
              <div className="flex justify-between py-1"><span className="text-[color:var(--color-ink-soft)]">Name</span><span>{removing.name ?? '—'}</span></div>
              <div className="flex justify-between py-1"><span className="text-[color:var(--color-ink-soft)]">Joined</span><span>{when((removing as Record<string, unknown>).createdAt as string | undefined)}</span></div>
            </Card>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</Btn>
              <Btn variant="danger" loading={removeBusy} onClick={confirmRemove}>Remove</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
