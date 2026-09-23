# MCP Inspector

The MCP Inspector at `/kuadrant/mcp-inspector` connects to an
`MCPGatewayExtension`, lists its tools, builds inputs from each tool's JSON
schema, and runs `tools/call`. MCP session IDs and optional gateway bearer
tokens are held in browser memory only.

## Connection path

```text
Browser -> Backstage /api/kuadrant -> MCP Gateway
```

The Backstage backend reads the selected `MCPGatewayExtension` and its
referenced Gateway through Kubernetes, derives the listener's public MCP URL,
and relays the request directly to `/mcp`. The backend uses its existing
Kubernetes service-account identity for resource discovery. No ConsolePlugin,
Console proxy Service, port-forward, or service CA ConfigMap is required.

## Security and headers

Backstage authentication and the `kuadrant.mcp.inspector.use` permission guard
the browser-facing endpoint. The backend forwards only MCP transport and
routing headers: `Content-Type`, `Accept`, `MCP-Protocol-Version`,
`Mcp-Session-Id`, `Mcp-Method`, `Mcp-Name`, `Mcp-Param-*`, and
`X-Kuadrant-MCP-Authorization`. The latter is translated by the Backstage
proxy to a gateway `Authorization` header and is never used as the Kubernetes
credential.

The relay request body is limited to 1 MiB. Response status, content type, MCP
protocol version, MCP session ID, and JSON/SSE body are returned to the browser.

## Destination security

The destination allowlist is optional. When configured,
`backend.mcpProxy.allowedOrigins` must contain exact HTTP(S) origins. Wildcards,
credentials, query strings, and paths such as `/mcp` are rejected. An empty or
omitted list allows destinations derived from the admin-managed Gateway and
extension resources.

```yaml
backend:
  mcpProxy:
    allowedOrigins:
      - https://mcp.example.com
```

Bearer tokens are only forwarded to HTTPS listeners by default. For local
development with an HTTP listener, explicitly set
`backend.mcpProxy.allowInsecureAuth: true`; this should not be enabled in
production.

## Using the Tools view

1. Select an MCP gateway extension and protocol mode. **Auto** probes the
   2026-07-28 stateless protocol and falls back to the 2025-11-25 legacy
   handshake; the explicit modes force one version. Once discovery completes,
   unsupported versions are disabled for that extension.
2. For the legacy mode, the client sends `initialize`,
   `notifications/initialized`, and `tools/list`. Stateless mode starts with
   `server/discover` and does not create a session.
3. If the gateway returns `401`, enter a gateway bearer token in the modal. The
   token is kept in browser memory only.
4. Select or search for a tool, fill its generated inputs, and optionally add
   `_meta` key/value pairs.
5. Use **Validate only** to check inputs locally or **Run tool** to send
   `tools/call`.
6. Inspect the server result and JSON-RPC request/response in the Output card.

For modern protocol connections, tool arguments marked with `x-mcp-header` in
the tool schema are mirrored as `Mcp-Param-*` headers. Values are encoded when
needed for safe HTTP transport, and invalid header annotations are excluded
from the tool list.

Prompts and Logs are visible as disabled tabs and remain follow-up work.
