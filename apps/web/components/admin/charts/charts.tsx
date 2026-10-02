'use client';

import { useRef, useState } from 'react';

/**
 * Small, dependency-free charts for the admin analytics page. The site is dark-only,
 * so colours are the dark steps of the validated reference palette (dataviz skill):
 * series-1 blue #3987e5, series-2 orange #d95926 — checked against the panel surface.
 */
export const SERIES = ['#3987e5', '#d95926'] as const;
const GRID = '#262f4d';

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color, height: 2 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

/** Multi-series line chart on one shared axis, with a crosshair + tooltip on hover. */
export function LineChart({ labels, series, height = 240 }: { labels: string[]; series: LineSeries[]; height?: number }) {
  const W = 720;
  const H = height;
  const pad = { l: 36, r: 16, t: 12, b: 26 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = niceCeil(max);
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const ticks = [0, niceMax / 2, niceMax];
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const onMove = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={series.map((s) => s.label).join(' and ') + ' per day'}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8b95b7" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {[0, Math.floor((labels.length - 1) / 2), labels.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize={11} fill="#8b95b7">
            {shortDay(labels[i])}
          </text>
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#8b95b7" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.label} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="#141a2e" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 whitespace-nowrap rounded-lg border border-line bg-ink px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > labels.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
        >
          <p className="mb-1 font-semibold">{shortDay(labels[hover])}</p>
          {series.map((s) => (
            <p key={s.label} className="flex items-center gap-2 text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}: <span className="font-semibold text-white">{s.values[hover]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a single series (funnel steps, per-game rates). */
export function Bars({ rows, max = 100, suffix = '%' }: { rows: { label: string; value: number | null; note?: string }[]; max?: number; suffix?: string }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr_5rem] items-center gap-3 text-sm" title={`${r.label}: ${r.value ?? '–'}${suffix}`}>
          <span className="truncate text-muted">{r.label}</span>
          <div className="h-3">
            {r.value !== null && r.value > 0 && (
              <div className="h-3 rounded-r" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: SERIES[0] }} />
            )}
          </div>
          <span className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {r.value === null ? '–' : `${r.value}${suffix}`}
            {r.note && <span className="ml-1 text-xs text-muted">{r.note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Retention cell shaded on a single-hue (blue) sequential scale; text stays in text colours. */
export function HeatCell({ value }: { value: number | null }) {
  if (value === null) return <td className="px-2 py-1 text-center text-muted/40">·</td>;
  const alpha = 0.12 + Math.min(1, value / 60) * 0.68;
  return (
    <td className="px-2 py-1 text-center" style={{ background: `rgba(57,135,229,${alpha.toFixed(2)})`, fontVariantNumeric: 'tabular-nums' }}>
      {value}%
    </td>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((c) => c >= v)!;
}

export function fmtNum(v: number) {
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString('en-IN');
}

export function shortDay(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
