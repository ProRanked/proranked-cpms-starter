import { useEffect, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError } from '../api';
import { useResource } from '../hooks';
import { tokens } from '../tokens';
import { Card, PageHeader, Spinner, ErrorBox, Empty, Field, Input, Select, Btn, Notice } from '../components/ui';

// Settings shape is loose (Record) — read defensively across likely server key names, never assume one.
const str = (o: Record<string, unknown> | null | undefined, ...keys: string[]): string => {
  if (!o) return '';
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
};
const hex = (v: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);

interface FormState {
  name: string;
  contactEmail: string;
  website: string;
  country: string;
  currency: string;
  timezone: string;
  brandPrimary: string;
  brandSecondary: string;
  logoUrl: string;
  vat: string;
  address: string;
  invoicePrefix: string;
  paymentTermsDays: string;
}

const BLANK: FormState = {
  name: '', contactEmail: '', website: '', country: '', currency: 'USD', timezone: '',
  brandPrimary: tokens.brand, brandSecondary: tokens.brandDim, logoUrl: '',
  vat: '', address: '', invoicePrefix: '', paymentTermsDays: '',
};

const CCYS = ['USD', 'EUR', 'GBP', 'MXN', 'CAD', 'AUD', 'JPY', 'CHF'];

export function Settings() {
  const network = useNetwork();
  const res = useResource(() => api.settings(network), [network], !!network);

  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; msg: string } | null>(null);

  // Bind the editable form whenever the server settings reload.
  useEffect(() => {
    const s = res.data;
    if (!s) return;
    const branding = (s.branding ?? {}) as Record<string, unknown>;
    const billing = (s.billing ?? {}) as Record<string, unknown>;
    setForm({
      name: str(s, 'name', 'networkName'),
      contactEmail: str(s, 'contactEmail', 'email', 'supportEmail'),
      website: str(s, 'website', 'url', 'homepage'),
      country: str(s, 'country', 'countryCode'),
      currency: str(s, 'currency', 'defaultCurrency') || 'USD',
      timezone: str(s, 'timezone', 'tz', 'timeZone'),
      brandPrimary: hex(str(branding, 'primaryColor', 'primary', 'color', 'accentColor'), tokens.brand),
      brandSecondary: hex(str(branding, 'secondaryColor', 'secondary'), tokens.brandDim),
      logoUrl: str(branding, 'logoUrl', 'logo', 'logoUri'),
      vat: str(billing, 'vat', 'vatNumber', 'taxId'),
      address: str(billing, 'address', 'billingAddress'),
      invoicePrefix: str(billing, 'invoicePrefix', 'prefix'),
      paymentTermsDays: str(billing, 'paymentTermsDays', 'termsDays', 'netDays'),
    });
    setNotice(null);
  }, [res.data]);

  const set = (k: keyof FormState) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const body = {
        name: form.name || undefined,
        contactEmail: form.contactEmail || undefined,
        website: form.website || undefined,
        country: form.country || undefined,
        currency: form.currency || undefined,
        timezone: form.timezone || undefined,
        branding: {
          primaryColor: form.brandPrimary,
          secondaryColor: form.brandSecondary,
          logoUrl: form.logoUrl || undefined,
        },
        billing: {
          vat: form.vat || undefined,
          address: form.address || undefined,
          invoicePrefix: form.invoicePrefix || undefined,
          paymentTermsDays: form.paymentTermsDays ? Number(form.paymentTermsDays) : undefined,
        },
      };
      await api.updateSettings(network, body);
      setNotice({ tone: 'ok', msg: 'Settings saved.' });
      res.reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setNotice({
          tone: 'bad',
          msg: e.status === 403
            ? `${e.message} — needs cpms:write:settings (may be off by default / Admin-only)`
            : `${e.code} (${e.status}): ${e.message}`,
        });
      } else {
        setNotice({ tone: 'bad', msg: String((e as Error)?.message ?? e) });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!network) return <Empty msg="Select a network." />;

  const ccyOptions = form.currency && !CCYS.includes(form.currency) ? [form.currency, ...CCYS] : CCYS;

  return (
    <div>
      <PageHeader
        title="Network settings"
        sub="GET·PUT /cpms/v1/settings"
        right={<Btn variant="primary" onClick={save} loading={saving} disabled={res.loading || !!res.error}>Save changes</Btn>}
      />

      {res.loading ? (
        <Spinner />
      ) : res.error ? (
        <ErrorBox error={res.error} />
      ) : (
        <div className="space-y-6 max-w-3xl">
          {notice && <Notice tone={notice.tone}>{notice.msg}</Notice>}

          <Card title="Identity">
            <div className="grid gap-4 sm:grid-cols-2 p-5">
              <Field label="Network name">
                <Input value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Acme Charging" />
              </Field>
              <Field label="Contact email">
                <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail')(e.target.value)} placeholder="ops@acme.com" />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={(e) => set('website')(e.target.value)} placeholder="https://acme.com" />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set('country')(e.target.value)} placeholder="US" />
              </Field>
              <Field label="Default currency">
                <Select value={form.currency} onChange={set('currency')} className="w-full">
                  {ccyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Timezone">
                <Input value={form.timezone} onChange={(e) => set('timezone')(e.target.value)} placeholder="America/Puerto_Rico" className="mono" />
              </Field>
            </div>
          </Card>

          <Card title="Branding">
            <div className="grid gap-4 sm:grid-cols-2 p-5">
              <Field label="Primary color">
                <div className="flex items-center gap-2">
                  <Input type="color" value={hex(form.brandPrimary, tokens.brand)} onChange={(e) => set('brandPrimary')(e.target.value)} className="h-9 w-12 shrink-0 p-1" />
                  <Input value={form.brandPrimary} onChange={(e) => set('brandPrimary')(e.target.value)} placeholder="#0a84ff" className="mono" />
                </div>
              </Field>
              <Field label="Secondary color">
                <div className="flex items-center gap-2">
                  <Input type="color" value={hex(form.brandSecondary, tokens.brandDim)} onChange={(e) => set('brandSecondary')(e.target.value)} className="h-9 w-12 shrink-0 p-1" />
                  <Input value={form.brandSecondary} onChange={(e) => set('brandSecondary')(e.target.value)} placeholder="#7cb8ff" className="mono" />
                </div>
              </Field>
              <Field label="Logo URL">
                <div className="flex items-center gap-3">
                  <Input value={form.logoUrl} onChange={(e) => set('logoUrl')(e.target.value)} placeholder="https://cdn.acme.com/logo.svg" className="mono" />
                  {/^https?:\/\//.test(form.logoUrl) && (
                    <img src={form.logoUrl} alt="logo preview" className="h-9 w-9 shrink-0 rounded-lg border border-black/10 object-contain bg-white" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  )}
                </div>
              </Field>
            </div>
          </Card>

          <Card title="Billing">
            <div className="grid gap-4 sm:grid-cols-2 p-5">
              <Field label="VAT / Tax ID">
                <Input value={form.vat} onChange={(e) => set('vat')(e.target.value)} placeholder="EU123456789" className="mono" />
              </Field>
              <Field label="Invoice prefix">
                <Input value={form.invoicePrefix} onChange={(e) => set('invoicePrefix')(e.target.value)} placeholder="INV-" className="mono" />
              </Field>
              <Field label="Payment terms (days)">
                <Input type="number" min={0} value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays')(e.target.value)} placeholder="30" className="mono" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Billing address">
                  <Input value={form.address} onChange={(e) => set('address')(e.target.value)} placeholder="123 Volt St, San Juan, PR 00901" />
                </Field>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {notice && <Notice tone={notice.tone}>{notice.msg}</Notice>}
            <Btn variant="primary" onClick={save} loading={saving}>Save changes</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
