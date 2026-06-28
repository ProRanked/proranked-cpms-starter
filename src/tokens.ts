// Design tokens in JS — mirror the CSS vars in index.css so charts + inline styles read brand colors from
// ONE place. Re-skin in Lovable/Claude-design: change these (and the matching @theme block in index.css).
export const tokens = {
  brand: '#0a84ff',
  brandDim: '#7cb8ff',
  ink: '#0b1220',
  inkSoft: '#5b6b7e',
  ok: '#10b981',
  warn: '#f59e0b',
  bad: '#ef4444',
  mute: '#94a3b8',
};

// Charger/connector status → chart color.
export const statusColor = (status: string): string => {
  const s = (status || '').toLowerCase();
  if (s.includes('avail')) return tokens.ok;
  if (s.includes('charg')) return tokens.brand;
  if (s.includes('offline') || s.includes('unavail') || s.includes('fault') || s.includes('error')) return tokens.bad;
  if (s.includes('prepar') || s.includes('finish') || s.includes('suspend') || s.includes('reserved')) return tokens.warn;
  return tokens.mute;
};
