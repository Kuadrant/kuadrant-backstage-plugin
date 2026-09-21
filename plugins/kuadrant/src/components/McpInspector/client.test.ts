import {
  MCP_PROTOCOL_VERSION,
  McpClient,
  McpUnauthorizedError,
} from './client';

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

describe('McpClient', () => {
  it('initializes and forwards the session to subsequent requests', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } },
          { headers: { 'Mcp-Session-Id': 'session-1', 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
    const client = new McpClient(transport);

    await client.connect();
    await client.listTools();

    expect(client.getSessionId()).toBe('session-1');
    expect(transport.mock.calls[1][1].sessionId).toBe('session-1');
    expect(transport.mock.calls[2][1].sessionId).toBe('session-1');
  });

  it('follows tools/list cursors', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [{ name: 'first' }], nextCursor: 'page-2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: { tools: [{ name: 'second' }] },
        }),
      );
    const client = new McpClient(transport);

    await expect(client.listTools()).resolves.toEqual([{ name: 'first' }, { name: 'second' }]);
    expect(transport.mock.calls[1][0].params).toEqual({ cursor: 'page-2' });
  });

  it('passes gateway authentication separately from Backstage auth', async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
    const client = new McpClient(transport);
    client.setAuthorization('secret-token');

    await client.listTools();

    expect(transport.mock.calls[0][1].authorization).toBe('Bearer secret-token');
  });

  it('accepts a bearer token with or without its scheme prefix', async () => {
    const transport = jest
      .fn()
      .mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }));
    const client = new McpClient(transport);
    client.setAuthorization('  Bearer secret-token  ');

    await client.listTools();

    expect(transport.mock.calls[0][1].authorization).toBe('Bearer secret-token');
  });

  it('reports an authentication challenge', async () => {
    const client = new McpClient(jest.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(client.connect()).rejects.toBeInstanceOf(McpUnauthorizedError);
  });

  it('discovers the stateless protocol in auto mode', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { supportedVersions: [MCP_PROTOCOL_VERSION] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
    const client = new McpClient(transport, { protocolMode: 'auto' });

    await client.connect();
    await expect(client.listTools()).resolves.toEqual([]);

    expect(transport.mock.calls[0][0].method).toBe('server/discover');
    expect(transport.mock.calls[0][0].params).toEqual(
      expect.objectContaining({
        _meta: expect.objectContaining({
          'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
        }),
      }),
    );
    expect(transport.mock.calls[0][1].protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('mirrors modern x-mcp-header tool arguments into MCP parameter headers', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { supportedVersions: [MCP_PROTOCOL_VERSION] },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [
              {
                name: 'route-query',
                inputSchema: {
                  type: 'object',
                  properties: {
                    region: { type: 'string', 'x-mcp-header': 'Region' },
                    options: {
                      type: 'object',
                      properties: {
                        tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: '2.0',
          id: 3,
          result: { content: [] },
        }),
      );
    const client = new McpClient(transport, { protocolMode: MCP_PROTOCOL_VERSION });

    await client.connect();
    await client.listTools();
    await client.callTool('route-query', {
      region: 'us-west1',
      options: { tenant: 'acme, 世界' },
    });

    expect(transport.mock.calls[2][1].mcpParamHeaders).toEqual({
      'Mcp-Param-Region': 'us-west1',
      'Mcp-Param-Tenant': '=?base64?YWNtZSwg5LiW55WM?=',
    });
  });
});
