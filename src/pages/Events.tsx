import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '../App';
import { api, ApiError } from '../api';
import { PageHeader, Empty, Card, Notice, Btn, StatusPill } from '../components/ui';

// Live charger/session event feed over Server-Sent Events. We can't use the native EventSource (it can't set the
// Authorization header), so api.streamEvents drives a fetch-stream and invokes our callback per SSE frame. We keep
// an AbortController per connection and abort it on unmount / network change / Stop.

const MAX = 200;

interface FeedEvent { id: number; type: string; data: unknown; at: number }

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
// One-line summary of the event payload (first few fields). Full JSON is exposed via the row title= tooltip.
function summarize(data: unknown): string {
  if (data === null || data === undefined) return '∅';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj).slice(0, 6);
  if (!keys.length) return '{}';
  return keys.map((k) => `${k}=${fmtVal(obj[k])}`).join('   ');
}
function pretty(data: unknown): string {
  try { return typeof data === 'string' ? data : JSON.stringify(data, null, 2); } catch { return String(data); }
}

function LiveDot({ streaming, live, error }: { streaming: boolean; live: boolean; error: boolean }) {
  if (error) return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />Disconnected
    </span>
  );
  if (streaming && live) return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>Live
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--color-ink-soft)]">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />{live ? 'Connecting…' : 'Paused'}
    </span>
  );
}

export function Events() {
  const network = useNetwork();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [live, setLive] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [gen, setGen] = useState(0); // bump to force a fresh connection (Reconnect)
  const idRef = useRef(0);

  // Reset the feed whenever the operator switches networks — old events don't belong to the new one.
  useEffect(() => { setEvents([]); setError(null); setClosed(false); }, [network]);

  // Open / close the SSE connection. Re-runs on network change, Stop/Start toggle, or Reconnect (gen).
  useEffect(() => {
    if (!network || !live) { setStreaming(false); return; }
    const controller = new AbortController();
    let active = true;
    setError(null); setClosed(false); setStreaming(true);
    api.streamEvents(network, (e) => {
      if (!active) return;
      setEvents((prev) => {
        const next: FeedEvent[] = [{ id: ++idRef.current, type: e.type, data: e.data, at: Date.now() }, ...prev];
        return next.length > MAX ? next.slice(0, MAX) : next;
      });
    }, controller.signal)
      .then(() => { if (active) { setStreaming(false); setClosed(true); } }) // server closed the stream
      .catch((err) => {
        if (!active || controller.signal.aborted) return; // intentional Stop / unmount
        setStreaming(false);
        setError(err instanceof ApiError ? err : new ApiError(0, 'stream_error', String((err as Error)?.message ?? err)));
      });
    return () => { active = false; controller.abort(); };
  }, [network, live, gen]);

  const reconnect = () => { setError(null); setClosed(false); setLive(true); setGen((g) => g + 1); };

  if (!network) return <Empty msg="Select a network to continue." />;

  const right = (
    <div className="flex items-center gap-3">
      <LiveDot streaming={streaming} live={live} error={!!error} />
      <span className="text-sm text-[color:var(--color-ink-soft)] mono">{events.length}/{MAX}</span>
      <Btn size="sm" onClick={() => setEvents([])} disabled={!events.length}>Clear</Btn>
      <Btn size="sm" variant={live ? 'danger' : 'primary'} onClick={() => setLive((v) => !v)}>{live ? 'Stop' : 'Start'}</Btn>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Live Events" sub="GET /cpms/v1/events/stream (SSE)" right={right} />

      {error && (
        <Notice tone="bad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Stream error {error.status ? `(${error.status})` : ''}: {error.message}
              {error.status === 403 && ' — needs cpms:read:events scope (may be off by default / denied for non-Admin operators).'}
            </span>
            <Btn size="sm" onClick={reconnect}>Reconnect</Btn>
          </div>
        </Notice>
      )}

      {!error && closed && (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>The server closed the event stream.</span>
            <Btn size="sm" onClick={reconnect}>Reconnect</Btn>
          </div>
        </Notice>
      )}

      {events.length === 0 ? (
        <Empty msg={live ? (streaming ? 'Connected — waiting for live events…' : 'Connecting to the event stream…') : 'Stream paused — press Start to listen.'} />
      ) : (
        <Card>
          <div className="divide-y divide-black/[0.04]">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[color:var(--color-brand-50)]/40">
                <span className="mono text-xs text-[color:var(--color-ink-soft)] w-[68px] shrink-0 pt-0.5 tabular-nums">
                  {new Date(ev.at).toLocaleTimeString()}
                </span>
                <span className="shrink-0"><StatusPill value={ev.type} /></span>
                <span className="mono text-xs text-[color:var(--color-ink)] break-all" title={pretty(ev.data)}>
                  {summarize(ev.data)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
