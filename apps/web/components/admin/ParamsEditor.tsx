'use client';

import { useEffect, useState } from 'react';

/** Minimal JSON-Schema form: renders whatever params a game template declares. */
export interface JsonSchema {
  type?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  enum?: string[];
  properties?: Record<string, JsonSchema>;
}

type Params = Record<string, unknown>;

interface Props {
  schema: JsonSchema;
  value: Params;
  onChange: (next: Params) => void;
  errors?: Record<string, string>;
}

const humanize = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function ParamsEditor({ schema, value, onChange, errors = {} }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(schema.properties ?? {}).map(([key, prop]) => {
        const id = `param-${key}`;
        const label = prop.description ?? humanize(key);
        const range = prop.minimum !== undefined && prop.maximum !== undefined ? ` (${prop.minimum}–${prop.maximum})` : '';
        let input: React.ReactNode;
        if (prop.type === 'integer' || prop.type === 'number') {
          input = (
            <input
              id={id}
              name={key}
              type="number"
              className="input"
              min={prop.minimum}
              max={prop.maximum}
              step={prop.type === 'integer' ? 1 : 'any'}
              value={value[key] === undefined ? '' : String(value[key])}
              onChange={(e) => set(key, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          );
        } else if (prop.type === 'boolean') {
          input = <input id={id} type="checkbox" checked={Boolean(value[key])} onChange={(e) => set(key, e.target.checked)} />;
        } else if (prop.type === 'array' && prop.items?.enum) {
          const current = (value[key] as string[]) ?? [];
          input = (
            <div className="flex flex-wrap gap-4 py-2" id={id}>
              {prop.items.enum.map((opt) => (
                <label key={opt} className="text-sm">
                  <input
                    type="checkbox"
                    name={`${key}.${opt}`}
                    checked={current.includes(opt)}
                    onChange={(e) => set(key, e.target.checked ? [...current, opt] : current.filter((c) => c !== opt))}
                  />{' '}
                  {opt}
                </label>
              ))}
            </div>
          );
        } else if (prop.type === 'array') {
          input = <ListInput id={id} name={key} value={(value[key] as string[]) ?? []} onChange={(v) => set(key, v)} />;
        } else {
          input = <input id={id} name={key} className="input" value={String(value[key] ?? '')} onChange={(e) => set(key, e.target.value)} />;
        }
        const isList = prop.type === 'array' && !prop.items?.enum;
        return (
          <div key={key} className={prop.type === 'array' ? 'sm:col-span-2' : ''}>
            <label className="label" htmlFor={id}>
              {label}
              <span className="text-xs">{range}</span>
            </label>
            {input}
            {isList && <p className="mt-1 text-xs text-muted">One item per line.</p>}
            {errors[key] && <p className="mt-1 text-xs text-bad">{errors[key]}</p>}
          </div>
        );
      })}
    </div>
  );
}

const parseList = (raw: string) => raw.split('\n').map((v) => v.trim()).filter(Boolean);

/** One item per line. Keeps its own text so blank lines survive while typing. */
function ListInput({ id, name, value, onChange }: { id: string; name: string; value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState(value.join('\n'));
  useEffect(() => {
    // Sync when the value changes from outside (e.g. after a save), not from our own typing.
    if (parseList(raw).join('\n') !== value.join('\n')) setRaw(value.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <textarea
      id={id}
      name={name}
      className="input min-h-28"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(parseList(e.target.value));
      }}
    />
  );
}
