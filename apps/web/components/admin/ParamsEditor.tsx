'use client';

/** Minimal JSON-Schema form: renders whatever params a game template declares. */
export interface JsonSchema {
  type?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
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
        } else if (prop.type === 'array') {
          input = (
            <textarea
              id={id}
              name={key}
              className="input min-h-20"
              value={((value[key] as unknown[]) ?? []).join(' ')}
              onChange={(e) => set(key, e.target.value.split(/[\s,]+/).filter(Boolean))}
            />
          );
        } else {
          input = <input id={id} name={key} className="input" value={String(value[key] ?? '')} onChange={(e) => set(key, e.target.value)} />;
        }
        return (
          <div key={key} className={prop.type === 'array' ? 'sm:col-span-2' : ''}>
            <label className="label" htmlFor={id}>
              {label}
              <span className="text-xs">{range}</span>
            </label>
            {input}
            {prop.type === 'array' && <p className="mt-1 text-xs text-muted">Separate items with spaces.</p>}
            {errors[key] && <p className="mt-1 text-xs text-bad">{errors[key]}</p>}
          </div>
        );
      })}
    </div>
  );
}
