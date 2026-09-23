export const MCP_PROTOCOL_VERSION = '2026-07-28';
export const MCP_LEGACY_PROTOCOL_VERSION = '2025-11-25';
export type McpProtocolMode =
  | 'auto'
  | typeof MCP_PROTOCOL_VERSION
  | typeof MCP_LEGACY_PROTOCOL_VERSION;

const CLIENT_INFO = {
  name: 'kuadrant-backstage-mcp-inspector',
  version: '0.0.0',
};

const MAX_LIST_PAGES = 100;
const HTTP_FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const BASE64_SENTINEL = /^=\?base64\?.*\?=$/;

interface McpHeaderBinding {
  name: string;
  path: string[];
  type: 'string' | 'integer' | 'boolean';
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number | null;
  result?: T;
  error?: JsonRpcError;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
  'x-mcp-header'?: string;
}

export interface ToolsListResult {
  tools: McpTool[];
  nextCursor?: string;
}

export interface ToolsCallResult {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface PromptsListResult {
  prompts: McpPrompt[];
  nextCursor?: string;
}

export interface PromptGetResult {
  description?: string;
  messages: Array<{
    role: string;
    content: { type: string; text?: string; [key: string]: unknown };
  }>;
}

export interface McpExchange<T> {
  request: JsonRpcRequest;
  response: JsonRpcResponse<T>;
  result: T;
  status: number;
  statusText: string;
  durationMs: number;
}

export interface McpTransportHeaders {
  protocolVersion: string;
  sessionId?: string;
  authorization?: string;
  mcpParamHeaders?: Record<string, string>;
}

export interface McpClientOptions {
  protocolMode?: McpProtocolMode;
}

export interface McpConnection {
  protocolVersion: string;
  supportedVersions?: string[];
}

export type McpTransport = (
  body: JsonRpcRequest,
  headers: McpTransportHeaders,
) => Promise<Response>;

export class McpHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'McpHttpError';
  }
}

export class McpUnauthorizedError extends McpHttpError {
  constructor() {
    super(401, 'The selected MCP gateway requires authentication.');
    this.name = 'McpUnauthorizedError';
  }
}

export class McpRpcError extends Error {
  constructor(public readonly rpcError: JsonRpcError) {
    super(rpcError.message);
    this.name = 'McpRpcError';
  }
}

export class McpClient {
  private nextId = 1;
  private sessionId?: string;
  private authorization?: string;
  private protocolVersion = MCP_LEGACY_PROTOCOL_VERSION;
  private readonly protocolMode: McpProtocolMode;
  private readonly tools = new Map<string, McpTool>();

  constructor(private readonly transport: McpTransport, options: McpClientOptions = {}) {
    this.protocolMode = options.protocolMode || MCP_LEGACY_PROTOCOL_VERSION;
  }

  setAuthorization(token?: string): void {
    const normalizedToken = token?.trim().replace(/^Bearer\s+/i, '');
    this.authorization = normalizedToken ? `Bearer ${normalizedToken}` : undefined;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  async connect(): Promise<McpConnection> {
    this.sessionId = undefined;
    this.protocolVersion = MCP_LEGACY_PROTOCOL_VERSION;
    let supportedVersions: string[] | undefined;

    if (this.protocolMode !== MCP_LEGACY_PROTOCOL_VERSION) {
      this.protocolVersion = MCP_PROTOCOL_VERSION;
      try {
        const discovery = await this.call<{ supportedVersions?: unknown }>('server/discover', {});
        const discoveredVersions = discovery.supportedVersions;
        if (
          !Array.isArray(discoveredVersions) ||
          !discoveredVersions.every((version) => typeof version === 'string')
        ) {
          throw new Error('Invalid MCP discovery response: missing supportedVersions');
        }
        supportedVersions = discoveredVersions;
        if (supportedVersions.includes(MCP_PROTOCOL_VERSION)) {
          return { protocolVersion: this.protocolVersion, supportedVersions };
        }
        if (this.protocolMode !== 'auto' || !supportedVersions.includes(MCP_LEGACY_PROTOCOL_VERSION)) {
          throw new Error(
            `No compatible MCP protocol version (server supports: ${supportedVersions.join(', ')})`,
          );
        }
        this.protocolVersion = MCP_LEGACY_PROTOCOL_VERSION;
      } catch (error) {
        const fallbackStatus =
          error instanceof McpHttpError && [400, 404, 405].includes(error.status);
        const rpcCode = error instanceof McpRpcError ? error.rpcError.code : undefined;
        const advertisedVersions =
          error instanceof McpRpcError &&
          error.rpcError.data &&
          typeof error.rpcError.data === 'object' &&
          Array.isArray((error.rpcError.data as { supported?: unknown }).supported)
            ? (error.rpcError.data as { supported: unknown[] }).supported
            : undefined;
        const fallbackRpc =
          rpcCode === -32601 ||
          (rpcCode === -32022 && advertisedVersions?.includes(MCP_LEGACY_PROTOCOL_VERSION));
        if (this.protocolMode !== 'auto' || (!fallbackStatus && !fallbackRpc)) throw error;
        supportedVersions = [MCP_LEGACY_PROTOCOL_VERSION];
      }
    }

    this.protocolVersion = MCP_LEGACY_PROTOCOL_VERSION;
    const response = await this.request<Record<string, unknown>>('initialize', {
      protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });
    if (response.status === 401) {
      throw new McpUnauthorizedError();
    }
    this.sessionId = response.headers.get('Mcp-Session-Id') || undefined;
    await this.notification('notifications/initialized');
    return { protocolVersion: this.protocolVersion, supportedVersions };
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (;;) {
      const page = await this.call<ToolsListResult>('tools/list', cursor ? { cursor } : {});
      for (const tool of page.tools || []) {
        try {
          getMcpHeaderBindings(tool.inputSchema);
          tools.push(tool);
          this.tools.set(tool.name, tool);
        } catch (error) {
          console.warn(`Ignoring MCP tool ${tool.name}: ${(error as Error).message}`);
        }
      }
      cursor = page.nextCursor;
      if (!cursor) return tools;
      if (seenCursors.has(cursor) || seenCursors.size >= MAX_LIST_PAGES) {
        throw new Error('tools/list pagination did not terminate');
      }
      seenCursors.add(cursor);
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    metadata?: Record<string, string>,
  ): Promise<McpExchange<ToolsCallResult>> {
    const params = {
      name,
      arguments: args,
      ...(metadata && Object.keys(metadata).length > 0 ? { _meta: metadata } : {}),
    };
    const mcpParamHeaders =
      this.protocolVersion === MCP_PROTOCOL_VERSION
        ? buildMcpParamHeaders(this.tools.get(name)?.inputSchema, args)
        : undefined;
    return this.callWithExchange<ToolsCallResult>('tools/call', params, {
      mcpParamHeaders,
    });
  }

  async listPrompts(): Promise<McpPrompt[]> {
    const prompts: McpPrompt[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.call<PromptsListResult>('prompts/list', cursor ? { cursor } : {});
      prompts.push(...(page.prompts || []));
      cursor = page.nextCursor;
      if (!cursor) return prompts;
      if (seenCursors.has(cursor) || seenCursors.size >= MAX_LIST_PAGES) {
        throw new Error('prompts/list pagination did not terminate');
      }
      seenCursors.add(cursor);
    }
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<PromptGetResult> {
    return this.call<PromptGetResult>('prompts/get', { name, arguments: args });
  }

  private async notification(method: string): Promise<void> {
    const response = await this.transport({ jsonrpc: '2.0', method }, this.headers());
    if (!response.ok) {
      throw new McpHttpError(response.status, `${method} failed (HTTP ${response.status})`);
    }
  }

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return (await this.callWithExchange<T>(method, params)).result;
  }

  private async callWithExchange<T>(
    method: string,
    params: Record<string, unknown>,
    transportHeaders?: Pick<McpTransportHeaders, 'mcpParamHeaders'>,
  ): Promise<McpExchange<T>> {
    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const startedAt = Date.now();
    const response = await this.request<T>(method, params, request, transportHeaders);
    const message = await parseResponse<T>(response, id);
    if (message.error) throw new McpRpcError(message.error);
    return {
      request,
      response: message,
      result: message.result as T,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
    };
  }

  private async request<T>(
    method: string,
    params: Record<string, unknown>,
    preparedRequest?: JsonRpcRequest,
    transportHeaders?: Pick<McpTransportHeaders, 'mcpParamHeaders'>,
  ): Promise<Response> {
    const request = preparedRequest || {
      jsonrpc: '2.0' as const,
      id: this.nextId++,
      method,
      params: this.protocolVersion === MCP_PROTOCOL_VERSION
        ? {
            ...params,
            _meta: {
              ...(params._meta as Record<string, unknown> | undefined),
              'io.modelcontextprotocol/protocolVersion': this.protocolVersion,
              'io.modelcontextprotocol/clientCapabilities': {},
              'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
            },
          }
        : params,
    };
    if (preparedRequest && this.protocolVersion === MCP_PROTOCOL_VERSION) {
      request.params = {
        ...preparedRequest.params,
        _meta: {
          ...(preparedRequest.params?._meta as Record<string, unknown> | undefined),
          'io.modelcontextprotocol/protocolVersion': this.protocolVersion,
          'io.modelcontextprotocol/clientCapabilities': {},
          'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
        },
      };
    }
    const response = await this.transport(request, {
      ...this.headers(),
      ...transportHeaders,
    });
    if (!response.ok) {
      if (response.status === 401) throw new McpUnauthorizedError();
      throw new McpHttpError(response.status, `${method} failed (HTTP ${response.status})`);
    }
    if (!preparedRequest) {
      const message = await parseResponse<T>(response.clone(), request.id!);
      if (message.error) throw new McpRpcError(message.error);
    }
    return response;
  }

  private headers(): McpTransportHeaders {
    return {
      protocolVersion: this.protocolVersion,
      sessionId: this.sessionId,
      authorization: this.authorization,
    };
  }
}

function getMcpHeaderBindings(schema: JsonSchema | undefined): McpHeaderBinding[] {
  const bindings: McpHeaderBinding[] = [];
  const names = new Set<string>();

  const visit = (current: JsonSchema | undefined, path: string[]) => {
    for (const [propertyName, property] of Object.entries(current?.properties || {})) {
      const propertyPath = [...path, propertyName];
      const headerName = property['x-mcp-header'];
      if (headerName !== undefined) {
        if (
          typeof headerName !== 'string' ||
          !headerName ||
          !HTTP_FIELD_NAME.test(headerName) ||
          names.has(headerName.toLowerCase()) ||
          !['string', 'integer', 'boolean'].includes(property.type || '')
        ) {
          throw new Error(`invalid x-mcp-header on ${propertyPath.join('.')}`);
        }
        names.add(headerName.toLowerCase());
        bindings.push({
          name: headerName,
          path: propertyPath,
          type: property.type as McpHeaderBinding['type'],
        });
      }
      visit(property, propertyPath);
    }
  };

  visit(schema, []);
  return bindings;
}

function buildMcpParamHeaders(
  schema: JsonSchema | undefined,
  args: Record<string, unknown>,
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const binding of getMcpHeaderBindings(schema)) {
    const value = valueAtPath(args, binding.path);
    if (value === undefined || value === null) continue;
    headers[`Mcp-Param-${binding.name}`] = encodeMcpHeaderValue(value, binding.type);
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function valueAtPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function encodeMcpHeaderValue(
  value: unknown,
  type: McpHeaderBinding['type'],
): string {
  let stringValue: string;
  if (type === 'string' && typeof value === 'string') {
    stringValue = value;
  } else if (type === 'integer' && typeof value === 'number' && Number.isSafeInteger(value)) {
    stringValue = String(value);
  } else if (type === 'boolean' && typeof value === 'boolean') {
    stringValue = String(value);
  } else {
    throw new Error(`invalid value for x-mcp-header parameter of type ${type}`);
  }

  const needsEncoding =
    !/^[\x20-\x7e]*$/.test(stringValue) ||
    /^[ \t]/.test(stringValue) ||
    /[ \t]$/.test(stringValue) ||
    BASE64_SENTINEL.test(stringValue);
  if (!needsEncoding) return stringValue;

  const bytes = new TextEncoder().encode(stringValue);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?base64?${btoa(binary)}?=`;
}

async function parseResponse<T>(
  response: Response,
  requestId: number,
): Promise<JsonRpcResponse<T>> {
  const text = await response.text();
  const messages = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? parseSse(text)
    : [JSON.parse(text)];
  const match = messages.find((message) => {
    if (!message || typeof message !== 'object') return false;
    const candidate = message as JsonRpcResponse<T>;
    return candidate.id === requestId || (candidate.id === null && !!candidate.error);
  });
  if (!match) {
    throw new McpHttpError(response.status, `No JSON-RPC response for request ${requestId}`);
  }
  return match as JsonRpcResponse<T>;
}

function parseSse(raw: string): unknown[] {
  return raw.split(/\r?\n\r?\n/).flatMap((event) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) return [];
    try {
      return [JSON.parse(data)];
    } catch {
      return [];
    }
  });
}
