'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import type { CoinHistory, ShopResponse } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { DEFAULT_SHIP, ShipPreview } from '@/components/ShipPreview';

const REASON: Record<string, string> = {
  PURCHASE: 'Bought coins',
  EXTRA_TRY: 'Extra play',
  EXTRA_TRY_REFUND: 'Extra play refunded',
  SKIN: 'Ship skin',
  ADMIN_GRANT: 'Added by Axia support',
  ADMIN_DEDUCT: 'Removed by Axia support',
};

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function ShopPage() {
  const { user, refresh } = useAuth();
  const { data, mutate } = useSWR<ShopResponse>('/shop', fetcher);
  const { data: history, mutate: mutateHistory } = useSWR<CoinHistory>(user ? '/me/coins' : null, fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const act = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      await Promise.all([mutate(), mutateHistory(), refresh()]);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="text-muted">Loading…</p>;
  const canBuy = data.canBuy && data.payments.enabled;
  const skins = data.items.filter((i) => i.gameSlug === 'neon-dodge');
  const noneEquipped = !skins.some((s) => s.equipped);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Shop</h1>
          <p className="mt-1 text-muted">Coins unlock extra plays and ship skins. Nothing here changes how a game plays.</p>
        </div>
        {data.balance !== null && data.canBuy && (
          <p className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-2 text-2xl font-black text-warn" data-testid="balance">
            🪙 {data.balance.toLocaleString('en-IN')}
          </p>
        )}
      </div>

      {data.payments.testMode && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn" data-testid="test-mode">
          <b>Test mode:</b> no real payment is taken. Coins bought here are for trying the shop during the beta.
        </p>
      )}
      {!user && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">
          <Link className="text-brand-2 underline" href="/login?next=/shop">
            Sign in
          </Link>{' '}
          to buy coins and skins.
        </p>
      )}
      {user && !data.canBuy && (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">Coins are for players aged 19 and over. Every game stays free to play.</p>
      )}
      {msg && <p className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}

      <section>
        <h2 className="mb-3 text-xl font-bold">Coin packs</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {data.packs.map((p) => (
            <div key={p.id} className="card text-center" data-testid={`pack-${p.key}`}>
              <p className="text-sm font-semibold uppercase tracking-widest text-muted">{p.label}</p>
              <p className="mt-2 text-4xl font-black text-warn">🪙 {p.coins + p.bonusCoins}</p>
              <p className="h-5 text-sm text-good">{p.bonusCoins > 0 ? `includes ${p.bonusCoins} bonus` : ''}</p>
              <button
                className="btn-primary mt-4 w-full"
                disabled={!canBuy || busy !== null}
                onClick={() =>
                  act(p.key, async () => {
                    const r = await api<{ coins: number; balance: number }>('/shop/purchases', { body: { packId: p.id } });
                    return `Added ${r.coins} coins. Balance: ${r.balance}.`;
                  })
                }
              >
                {busy === p.key ? 'Buying…' : data.payments.enabled ? `Buy for ${rupees(p.pricePaise)}` : 'Coming soon'}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Coins have no cash value. They can’t be withdrawn, transferred or exchanged for prizes, and they are never won in games. See{' '}
          <Link className="underline" href="/terms#coins">
            Terms
          </Link>{' '}
          and{' '}
          <Link className="underline" href="/refunds">
            Refunds
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-bold">Neon Dodge ships</h2>
        <p className="mb-3 text-sm text-muted">Pure style: every ship has exactly the same size, speed and hitbox.</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <SkinCard
            label="Standard"
            skin={DEFAULT_SHIP}
            note="Free"
            action={noneEquipped ? 'Equipped' : 'Equip'}
            disabled={!user || noneEquipped || busy !== null}
            onClick={() => act('default', async () => (await api('/shop/equip/neon-dodge/default', { body: {} }), 'Standard ship equipped.'))}
          />
          {skins.map((s) => (
            <SkinCard
              key={s.key}
              testId={`skin-${s.key}`}
              label={s.label}
              skin={s.data}
              note={s.owned ? 'Owned' : `🪙 ${s.priceCoins}`}
              action={s.equipped ? 'Equipped' : s.owned ? 'Equip' : busy === s.key ? 'Buying…' : 'Buy'}
              disabled={s.equipped || busy !== null || (!s.owned && !data.canBuy) || !user}
              onClick={() =>
                act(s.key, async () => {
                  if (s.owned) {
                    await api(`/shop/equip/neon-dodge/${s.key}`, { body: {} });
                    return `${s.label} equipped.`;
                  }
                  await api(`/shop/items/${s.key}/buy`, { body: {} });
                  return `${s.label} is yours and equipped. Go fly it!`;
                })
              }
            />
          ))}
        </div>
      </section>

      {history && history.history.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Coin history</h2>
          <ul className="card divide-y divide-line p-0" data-testid="history">
            {history.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {REASON[h.reason] ?? h.reason}
                  <span className="ml-2 text-xs text-muted">{new Date(h.createdAt).toLocaleString('en-IN')}</span>
                </span>
                <span className={h.delta > 0 ? 'font-bold text-good' : 'font-bold text-bad'}>
                  {h.delta > 0 ? '+' : ''}
                  {h.delta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SkinCard(props: {
  label: string;
  skin: ShopResponse['items'][number]['data'];
  note: string;
  action: string;
  disabled: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <div className="card bg-[#070a16] text-center" data-testid={props.testId}>
      <ShipPreview skin={props.skin} />
      <p className="mt-2 font-bold">{props.label}</p>
      <p className="text-sm text-muted">{props.note}</p>
      <button className={props.action === 'Equipped' ? 'btn-ghost mt-3 w-full' : 'btn-primary mt-3 w-full'} disabled={props.disabled} onClick={props.onClick}>
        {props.action}
      </button>
    </div>
  );
}
