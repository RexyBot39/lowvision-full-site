import { AlertTriangle, Info } from 'lucide-react';
import { fmt } from './format';

/** Shared building blocks for the /admin dashboard tabs. */

export function Notice({ icon, title, children }: { icon: 'info' | 'warning'; title: string; children: React.ReactNode }) {
  const warn = icon === 'warning';
  const Icon = warn ? AlertTriangle : Info;
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${warn ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${warn ? 'text-amber-700' : 'text-blue-700'}`} aria-hidden="true" />
      <div className={`text-sm ${warn ? 'text-amber-900' : 'text-blue-900'}`}>
        <p className="font-semibold mb-0.5">{title}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Fetches just the unread count so the Messages tab badge shows while on Analytics. */

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, previous, days, compareLabel, note }: {
  label: string; value: number | null; previous?: number | null; days?: number;
  /** Overrides "vs previous N days", e.g. "vs last snapshot". */
  compareLabel?: string; note?: string;
}) {
  const against = compareLabel ?? (days ? `vs previous ${days} days` : '');
  let change: React.ReactNode = null;
  if (value != null && previous != null && against) {
    if (previous === 0) {
      change = value > 0 ? <span>New {compareLabel ? 'since last snapshot' : 'this period'}</span> : null;
    } else {
      const pct = Math.round(((value - previous) / previous) * 100);
      const dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
      change = (
        <span>
          <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}</span>{' '}
          {dir === 'flat' ? 'No change' : `${Math.abs(pct)}% ${dir}`} {against}
        </span>
      );
    }
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{fmt(value)}</p>
      {(change || note) && <p className="text-xs text-gray-500 mt-1.5">{change ?? note}</p>}
    </div>
  );
}

/** Ranked table with a thin inline bar for each row's share of the top value. */

