import { z } from 'zod';
import { memoryReconstruction } from './templates/memory-reconstruction';
import type { AnyGameTemplate } from './types';

/** Every playable template. Register new games here. */
export const templates: Record<string, AnyGameTemplate> = {
  [memoryReconstruction.key]: memoryReconstruction,
};

export function getTemplate(key: string): AnyGameTemplate | undefined {
  return templates[key];
}

export interface TemplateDescriptor {
  key: string;
  name: string;
  description: string;
  defaultParams: unknown;
  /** JSON Schema of the params, used by the admin panel to render an editor. */
  paramsJsonSchema: unknown;
}

export function describeTemplate(t: AnyGameTemplate): TemplateDescriptor {
  return {
    key: t.key,
    name: t.name,
    description: t.description,
    defaultParams: t.defaultParams,
    paramsJsonSchema: z.toJSONSchema(t.paramsSchema, { unrepresentable: 'any' }),
  };
}

export function listTemplates(): TemplateDescriptor[] {
  return Object.values(templates).map(describeTemplate);
}

export type ParamsValidation =
  | { ok: true; params: unknown }
  | { ok: false; errors: { path: string; message: string }[] };

/** Validates admin-supplied params for a template. Missing keys fall back to defaults. */
export function validateParams(templateKey: string, params: unknown): ParamsValidation {
  const t = getTemplate(templateKey);
  if (!t) return { ok: false, errors: [{ path: '', message: `Unknown template "${templateKey}"` }] };
  const merged = { ...(t.defaultParams as object), ...((params as object) ?? {}) };
  const result = t.paramsSchema.safeParse(merged);
  if (result.success) return { ok: true, params: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
