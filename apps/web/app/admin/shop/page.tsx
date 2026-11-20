'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmt } from '@/lib/dates';
import { StatTile } from '@/components/admin/charts/charts';
import { ShipPreview, hex } from '@/components/ShipPreview';
import type { ShipSkinData } from '@/lib/types';

interface Pack {
  id: string;
  key: string;
  label: string;
  pricePaise: number;
  coins: number;
  bonusCoins: number;
  active: boolean;
  sold: number;
}
interface Item {
  id: string;
  key: string;
  gameSlug: string;
  label: string;
  priceCoins: number;
  data: ShipSkinData;
  active: boolean;
  owners: number;
}
interface Overview {
  paymentsProvider: 'dev' | 'none';
  stats: {
    revenueTodayPaise: number;
    purchasesToday: number;
    revenue30dPaise: number;
    purchases30d: number;
    testPurchases30d: number;
    testRevenue30dPaise: number;
    buyers30d: number;
    coinsSpent30d: Record<string, number>;
    coinsOutstanding: number;
  };
  packs: Pack[];
  items: Item[];
  purchases: { id: string; user: { email: string; name: string }; pack: string; amountPaise: number; coins: number; provider: string; status: string; createdAt: string }[];
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function AdminShop() {
  const { data, mutate } = useSWR<Overview>('/admin/shop', fetcher);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState({ key: '', label: '', price: '', coins: '', bonus: '0' });
  const [item, setItem] = useState({ key: '', label: '', price: '', core: '#ffffff', glow: '#22d3ee', trail: '#22d3ee' });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };
  const num = (h: string) => parseInt(h.replace('#', ''), 16);

  if (!data) return <p className="text-muted">Loading…</p>;
  const s = data.stats;
  const spent = Object.entries(s.coinsSpent30d);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Shop &amp; coins</h1>
        <p className="mt-1 text-sm text-muted">
          Coins are spend-only: extra plays and cosmetics. They must never be given out as prizes or converted to money or vouchers.
        </p>
      </div>
      {data.paymentsProvider === 'dev' && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Test mode: purchases complete instantly without real payment. Production refuses to boot in this mode.</p>
      )}
      {data.paymentsProvider === 'none' && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">No payment gateway is connected yet, so players see “Coming soon” on coin packs.</p>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue today" value={rupees(s.revenueTodayPaise)} hint={`${s.purchasesToday} purchases`} />
        <StatTile label="Revenue (30d)" value={rupees(s.revenue30dPaise)} hint={`${s.purchases30d} purchases · ${s.buyers30d} buyers`} />
        <StatTile label="Test purchases (30d)" value={String(s.testPurchases30d)} hint={`${rupees(s.testRevenue30dPaise)} not real money`} />
        <StatTile label="Coins in wallets" value={s.coinsOutstanding.toLocaleString('en-IN')} hint={spent.length ? `spent 30d: ${spent.map(([r, n]) => `${r.toLowerCase()} ${n}`).join(', ')}` : 'nothing spent yet'} />
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold">Coin packs</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th>Pack</th>
              <th>Price</th>
              <th>Coins</th>
              <th>Bonus</th>
              <th>Sold</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.packs.map((p) => (
              <tr key={p.id} className={`border-t border-line ${p.active ? '' : 'opacity-50'}`}>
                <td className="py-2">
                  <b>{p.label}</b> <span className="text-xs text-muted">{p.key}</span>
                </td>
                <td>{rupees(p.pricePaise)}</td>
                <td>{p.coins}</td>
                <td>{p.bonusCoins}</td>
                <td>{p.sold}</td>
                <td className="text-right">
                  <button className="text-xs underline" onClick={() => run(() => api(`/admin/shop/packs/${p.id}`, { method: 'PATCH', body: { active: !p.active } }))}>
                    {p.active ? 'hide' : 'show'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/admin/shop/packs', {
                body: { key: pack.key, label: pack.label, pricePaise: Math.round(Number(pack.price) * 100), coins: Number(pack.coins), bonusCoins: Number(pack.bonus) },
              });
              setPack({ key: '', label: '', price: '', coins: '', bonus: '0' });
            });
          }}
        >
          <input className="input w-28" placeholder="key" value={pack.key} onChange={(e) => setPack({ ...pack, key: e.target.value })} />
          <input className="input w-32" placeholder="Label" value={pack.label} onChange={(e) => setPack({ ...pack, label: e.target.value })} />
          <input className="input w-24" placeholder="₹ price" type="number" value={pack.price} onChange={(e) => setPack({ ...pack, price: e.target.value })} />
          <input className="input w-24" placeholder="coins" type="number" value={pack.coins} onChange={(e) => setPack({ ...pack, coins: e.target.value })} />
          <input className="input w-24" placeholder="bonus" type="number" value={pack.bonus} onChange={(e) => setPack({ ...pack, bonus: e.target.value })} />
          <button className="btn-primary">Add pack</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">Cosmetics</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.items.map((i) => (
            <div key={i.id} className={`rounded-lg border border-line bg-[#070a16] p-3 text-center text-sm ${i.active ? '' : 'opacity-50'}`}>
              <ShipPreview skin={i.data} size={48} />
              <p className="mt-1 font-bold">{i.label}</p>
              <p className="text-xs text-muted">
                🪙 {i.priceCoins} · {i.owners} owners
              </p>
              <button className="mt-1 text-xs underline" onClick={() => run(() => api(`/admin/shop/items/${i.id}`, { method: 'PATCH', body: { active: !i.active } }))}>
                {i.active ? 'hide' : 'show'}
              </button>
            </div>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('/admin/shop/items', {
                body: {
                  key: item.key,
                  gameSlug: 'neon-dodge',
                  label: item.label,
                  priceCoins: Number(item.price),
                  data: { core: num(item.core), glow: num(item.glow), trail: num(item.trail) },
                },
              });
              setItem({ ...item, key: '', label: '', price: '' });
            });
          }}
        >
          <input className="input w-32" placeholder="ship-key" value={item.key} onChange={(e) => setItem({ ...item, key: e.target.value })} />
          <input className="input w-32" placeholder="Label" value={item.label} onChange={(e) => setItem({ ...item, label: e.target.value })} />
          <input className="input w-24" placeholder="coins" type="number" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} />
          {(['core', 'glow', 'trail'] as const).map((k) => (
            <label key={k} className="text-xs text-muted">
              {k}
              <input type="color" className="ml-1 h-9 w-10 align-middle" value={item[k]} onChange={(e) => setItem({ ...item, [k]: e.target.value })} />
            </label>
          ))}
          <ShipPreview skin={{ core: num(item.core), glow: num(item.glow), trail: num(item.trail) }} size={36} />
          <button className="btn-primary">Add ship skin</button>
        </form>
        <p className="text-xs text-muted">Colours preview: {hex(num(item.glow))}. Skins are visual only; they never change hitboxes or speed.</p>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-bold">Recent purchases</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-5 py-2">When</th>
              <th>Player</th>
              <th>Pack</th>
              <th>Amount</th>
              <th>Coins</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.purchases.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-5 py-2 text-xs text-muted">{fmt(p.createdAt)}</td>
                <td>{p.user.email}</td>
                <td>{p.pack}</td>
                <td>
                  {rupees(p.amountPaise)}
                  {p.provider === 'dev' && <span className="ml-1 text-xs text-warn">test</span>}
                </td>
                <td>{p.coins}</td>
                <td>{p.status}</td>
              </tr>
            ))}
            {data.purchases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-4 text-muted">
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
