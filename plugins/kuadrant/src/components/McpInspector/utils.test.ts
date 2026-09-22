import { humanize, serverNameForTool, validateToolInput } from './utils';

describe('MCP Inspector utilities', () => {
  it('validates and converts schema-generated fields', () => {
    const result = validateToolInput(
      {
        type: 'object',
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' },
          options: { type: 'object' },
          enabled: { type: 'boolean' },
        },
      },
      {
        name: 'Ada',
        count: '2',
        options: '{"verbose":true}',
        enabled: 'false',
      },
    );

    expect(result).toEqual({
      values: {
        name: 'Ada',
        count: 2,
        options: { verbose: true },
        enabled: false,
      },
      errors: {},
    });
  });

  it('reports missing and malformed values', () => {
    const result = validateToolInput(
      {
        required: ['name'],
        properties: {
          name: { type: 'string' },
          tags: { type: 'array' },
        },
      },
      { name: '', tags: 'not-json' },
    );

    expect(result.errors).toEqual({
      name: 'This field is required',
      tags: 'Enter valid JSON for this array',
    });
  });

  it('humanizes names and resolves the longest server prefix', () => {
    expect(humanize('incident_id')).toBe('Incident id');
    expect(
      serverNameForTool('toystore_greet', [
        { metadata: { name: 'toy' }, spec: { prefix: 'toy' } },
        { metadata: { name: 'toystore' }, spec: { prefix: 'toystore_' } },
      ]),
    ).toBe('toystore');
  });
});
