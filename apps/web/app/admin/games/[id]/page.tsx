'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api, ApiError, fetcher } from '@/lib/api';
import { fmt, fromLocalInput, toLocalInput } from '@/lib/dates';
import { ParamsEditor, type JsonSchema } from '@/components/admin/ParamsEditor';
import { LevelPreview } from '@/components/admin/LevelPreview';

interface Preset {
  id: string;
  key: string;
  label: string;
  params: Record<string, unknown>;
  isDefault: boolean;
  sortOrder: number;
}

interface AdminGameDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  templateKey: string;
  status: 'DRAFT' | 'LIVE' | 'DISABLED';
  ageModes: ('ADULT' | 'TEEN')[];
  estMinutes: number;
  attemptsPerDay: number;
  availableFrom: string | null;
  availableTo: string | null;
  sortOrder: number;
  presets: Preset[];
  challenges: { id: string; type: string; title: string; startsAt: string; endsAt: string; preset: { label: string } }[];
}

interface Template {
  key: string;
  name: string;
  paramsJsonSchema: JsonSchema;
}

export default function AdminGameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: game, mutate } = useSWR<AdminGameDetail>(`/admin/games/${id}`, fetcher);
  const { data: templates } = useSWR<Template[]>('/admin/templates', fetcher);
  const template = templates?.find((t) => t.key === game?.templateKey);

  if (!game || !templates) return <p className="text-muted">Loading…</p>;
  if (!template) return <p className="text-bad">Template “{game.templateKey}” is not installed in this build.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/games" className="text-sm text-muted">← Games</Link>
        <h1 className="text-3xl font-black">{game.name}</h1>
        <p className="text-sm text-muted">
          Template: {template.name} · changes apply to the next game started, no deploy needed.
        </p>
      </div>
      <GameSettings game={game} onSaved={() => mutate()} />
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Difficulty presets</h2>
        {game.presets.map((p) => (
          <PresetEditor key={p.id} gameId={game.id} templateKey={game.templateKey} preset={p} schema={template.paramsJsonSchema} onSaved={() => mutate()} />
        ))}
        <NewPreset gameId={game.id} onCreated={() => mutate()} />
      </section>
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Challenges</h2>
          <Link href="/admin/challenges" className="btn-ghost text-sm">Schedule challenges</Link>
        </div>
        <ul className="space-y-1 text-sm">
          {game.challenges.map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <b>{c.type}</b> {c.title} · {c.preset.label}
              </span>
              <span className="text-muted">
                {fmt(c.startsAt)} → {fmt(c.endsAt)}
              </span>
            </li>
          ))}
          {game.challenges.length === 0 && <li className="text-muted">None scheduled.</li>}
        </ul>
      </section>
    </div>
  );
}

function GameSettings({ game, onSaved }: { game: AdminGameDetail; onSaved: () => void }) {
  const [form, setForm] = useState(game);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setForm(game), [game]);

  const toggleAge = (mode: 'ADULT' | 'TEEN') =>
    setForm({ ...form, ageModes: form.ageModes.includes(mode) ? form.ageModes.filter((m) => m !== mode) : [...form.ageModes, mode] });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api(`/admin/games/${game.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          slug: form.slug,
          description: form.description,
          status: form.status,
          ageModes: form.ageModes,
          estMinutes: form.estMinutes,
          attemptsPerDay: form.attemptsPerDay,
          availableFrom: form.availableFrom,
          availableTo: form.availableTo,
          sortOrder: form.sortOrder,
        },
      });
      setMsg({ ok: true, text: 'Saved. Live now.' });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Failed' });
    }
  };

  return (
    <form onSubmit={save} className="card space-y-4">
      <h2 className="font-bold">Game settings</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="slug">Slug</label>
          <input id="slug" className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminGameDetail['status'] })}>
            <option value="DRAFT">Draft (admins only)</option>
            <option value="LIVE">Live</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label" htmlFor="desc">Description</label>
          <input id="desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="attempts">Plays per user per day</label>
          <input id="attempts" type="number" min={0} className="input" value={form.attemptsPerDay} onChange={(e) => setForm({ ...form, attemptsPerDay: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="est">Estimated minutes</label>
          <input id="est" type="number" min={1} className="input" value={form.estMinutes} onChange={(e) => setForm({ ...form, estMinutes: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort order</label>
          <input id="sort" type="number" className="input" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="from">Available from</label>
          <input id="from" type="datetime-local" className="input" value={toLocalInput(form.availableFrom)} onChange={(e) => setForm({ ...form, availableFrom: fromLocalInput(e.target.value) })} />
        </div>
        <div>
          <label className="label" htmlFor="to">Available until</label>
          <input id="to" type="datetime-local" className="input" value={toLocalInput(form.availableTo)} onChange={(e) => setForm({ ...form, availableTo: fromLocalInput(e.target.value) })} />
        </div>
        <div>
          <p className="label">Age modes</p>
          <label className="mr-4 text-sm">
            <input type="checkbox" checked={form.ageModes.includes('ADULT')} onChange={() => toggleAge('ADULT')} /> Adult (19+)
          </label>
          <label className="text-sm">
            <input type="checkbox" checked={form.ageModes.includes('TEEN')} onChange={() => toggleAge('TEEN')} /> Teen (14–18)
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" type="submit">Save settings</button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

function PresetEditor({
  gameId,
  templateKey,
  preset,
  schema,
  onSaved,
}: {
  gameId: string;
  templateKey: string;
  preset: Preset;
  schema: JsonSchema;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(preset.label);
  const [params, setParams] = useState(preset.params);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ level: unknown; serverLevel?: unknown } | null>(null);

  useEffect(() => {
    setLabel(preset.label);
    setParams(preset.params);
  }, [preset]);

  const handle = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    setErrors({});
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (err) {
      if (err instanceof ApiError) {
        const list = (err.body as { errors?: { path: string; message: string }[] })?.errors ?? [];
        setErrors(Object.fromEntries(list.map((e) => [e.path, e.message])));
        setMsg({ ok: false, text: err.message });
      } else setMsg({ ok: false, text: 'Failed' });
    }
  };

  const save = () =>
    handle(async () => {
      await api(`/admin/presets/${preset.id}`, { method: 'PATCH', body: { label, params } });
      onSaved();
    }, 'Saved. The next game uses these settings.');

  const doPreview = () =>
    handle(async () => setPreview(await api(`/admin/games/${gameId}/preview`, { body: { params } })), 'Preview generated.');

  const makeDefault = () =>
    handle(async () => {
      await api(`/admin/presets/${preset.id}`, { method: 'PATCH', body: { isDefault: true } });
      onSaved();
    }, 'Now the default.');

  const remove = () =>
    handle(async () => {
      if (!confirm(`Delete preset “${preset.label}”?`)) return;
      await api(`/admin/presets/${preset.id}`, { method: 'DELETE' });
      onSaved();
    }, 'Deleted.');

  return (
    <div className="card space-y-4" data-testid={`preset-${preset.key}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input className="input w-48 font-bold" aria-label="Preset label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <span className="font-mono text-xs text-muted">{preset.key}</span>
        {preset.isDefault ? (
          <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs text-good">default</span>
        ) : (
          <button type="button" className="text-xs text-muted underline" onClick={makeDefault}>
            make default
          </button>
        )}
      </div>
      <ParamsEditor schema={schema} value={params} onChange={setParams} errors={errors} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={save}>Save preset</button>
        <button type="button" className="btn-ghost" onClick={doPreview}>Preview level</button>
        {!preset.isDefault && (
          <button type="button" className="btn-ghost text-bad" onClick={remove}>Delete</button>
        )}
        {msg && <span className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</span>}
      </div>
      {preview && <LevelPreview templateKey={templateKey} level={preview.level} serverLevel={preview.serverLevel} />}
    </div>
  );
}

function NewPreset({ gameId, onCreated }: { gameId: string; onCreated: () => void }) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/admin/games/${gameId}/presets`, { body: { key, label } });
      setKey('');
      setLabel('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed');
    }
  };
  return (
    <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="np-key">New preset key</label>
        <input id="np-key" className="input" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="expert" value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="np-label">Label</label>
        <input id="np-label" className="input" required placeholder="Expert" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <button className="btn-ghost" type="submit">Add preset</button>
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
