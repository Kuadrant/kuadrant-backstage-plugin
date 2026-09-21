import { JsonSchema } from './client';

export interface ValidationResult {
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

export const humanize = (value: string): string => {
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const validateToolInput = (
  schema: JsonSchema | undefined,
  rawValues: Record<string, string>,
): ValidationResult => {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  const required = new Set(schema?.required || []);

  Object.entries(schema?.properties || {}).forEach(([name, property]) => {
    const raw = rawValues[name];
    if (raw === undefined || raw === '') {
      if (required.has(name)) errors[name] = 'This field is required';
      return;
    }

    if (property.type === 'number' || property.type === 'integer') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        errors[name] = 'Enter a valid number';
      } else if (property.type === 'integer' && !Number.isInteger(parsed)) {
        errors[name] = 'Enter a whole number';
      } else {
        values[name] = parsed;
      }
      return;
    }

    if (property.type === 'object' || property.type === 'array') {
      try {
        const parsed = JSON.parse(String(raw));
        if (property.type === 'array' && !Array.isArray(parsed)) {
          errors[name] = 'Enter a JSON array';
        } else if (
          property.type === 'object' &&
          (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        ) {
          errors[name] = 'Enter a JSON object';
        } else {
          values[name] = parsed;
        }
      } catch {
        errors[name] = `Enter valid JSON for this ${property.type}`;
      }
      return;
    }

    values[name] = property.type === 'boolean' ? raw === 'true' : raw;
  });

  return { values, errors };
};

export const serverNameForTool = (
  toolName: string,
  registrations: Array<{
    metadata: { name: string };
    spec?: { prefix?: string };
  }>,
): string | undefined =>
  registrations
    .filter((registration) => registration.spec?.prefix)
    .sort((a, b) => (b.spec?.prefix?.length || 0) - (a.spec?.prefix?.length || 0))
    .find((registration) => toolName.startsWith(registration.spec!.prefix!))?.metadata.name;
