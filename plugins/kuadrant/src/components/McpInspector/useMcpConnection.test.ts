import { act, renderHook, waitFor } from '@testing-library/react';
import { useApi } from '@backstage/core-plugin-api';
import { useMcpConnection } from './useMcpConnection';

jest.mock('@backstage/core-plugin-api', () => ({
  ...jest.requireActual('@backstage/core-plugin-api'),
  useApi: jest.fn(),
}));

const mockUseApi = useApi as jest.MockedFunction<typeof useApi>;

const response = (
  body: unknown,
  headers?: Record<string, string>,
  status = 200,
) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((value) => {
    resolve = value;
  });
  return { promise, resolve };
};

describe('useMcpConnection', () => {
  it('ignores tools returned by an older gateway connection', async () => {
    const toolsA = deferred<Response>();
    const toolsB = deferred<Response>();
    const api = {
      getMcpGatewayExtensions: jest.fn().mockResolvedValue({ items: [] }),
      getMcpServerRegistrations: jest.fn().mockResolvedValue({ items: [] }),
      requestMcp: jest.fn(
        (
          namespace: string,
          name: string,
          request: { id?: number; method: string },
        ) => {
          if (request.method === 'server/discover') {
            return Promise.resolve(response(undefined, {}, 404));
          }
          if (request.method === 'initialize') {
            return Promise.resolve(
              response(
                { jsonrpc: '2.0', id: request.id, result: {} },
                { 'Mcp-Session-Id': `${namespace}-${name}` },
              ),
            );
          }
          if (request.method === 'notifications/initialized') {
            return Promise.resolve(response(undefined));
          }
          if (request.method === 'tools/list') {
            return name === 'a' ? toolsA.promise : toolsB.promise;
          }
          throw new Error(`unexpected MCP method: ${request.method}`);
        },
      ),
    };
    mockUseApi.mockReturnValue(api as ReturnType<typeof useApi>);

    const { result } = renderHook(() => useMcpConnection());

    let firstConnection!: Promise<unknown>;
    let secondConnection!: Promise<unknown>;
    await act(async () => {
      firstConnection = result.current.changeGateway('ns/a');
      secondConnection = result.current.changeGateway('ns/b');
    });

    await act(async () => {
      toolsB.resolve(
        response({
          jsonrpc: '2.0',
          id: 3,
          result: { tools: [{ name: 'tool-from-b' }] },
        }),
      );
      await secondConnection;
    });

    toolsA.resolve(
      response({
        jsonrpc: '2.0',
        id: 3,
        result: { tools: [{ name: 'tool-from-a' }] },
      }),
    );
    await act(async () => {
      await firstConnection;
    });

    await waitFor(() => {
      expect(result.current.state.selectedGateway).toBe('ns/b');
      expect(result.current.state.connection).toBe('connected');
    });
  });
});
