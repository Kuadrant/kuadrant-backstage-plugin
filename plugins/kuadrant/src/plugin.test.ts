import { kuadrantPlugin, McpInspector } from './plugin';

describe('kuadrant', () => {
  it('should export plugin', () => {
    expect(kuadrantPlugin).toBeDefined();
    expect(McpInspector).toBeDefined();
  });
});
