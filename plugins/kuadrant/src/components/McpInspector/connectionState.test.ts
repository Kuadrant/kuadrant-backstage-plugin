import { connectionReducer, initialConnectionState } from './connectionState';

describe('connectionReducer', () => {
  it('starts a selected gateway in a connecting state', () => {
    const state = connectionReducer(initialConnectionState, {
      type: 'SELECT_GATEWAY',
      gateway: 'mcp/mcp-gateway',
    });

    expect(state.selectedGateway).toBe('mcp/mcp-gateway');
    expect(state.connection).toBe('disconnected');

    const connecting = connectionReducer(state, {
      type: 'START',
      gateway: state.selectedGateway,
      protocol: 'auto',
    });
    expect(connecting.connection).toBe('connecting');
    expect(connecting.protocolSupportLoading).toBe(true);
  });

  it('opens authentication without counting an expected 401 as an error', () => {
    const state = connectionReducer(
      { ...initialConnectionState, connection: 'connecting' },
      { type: 'FAIL', unauthorized: true },
    );

    expect(state.authOpen).toBe(true);
    expect(state.errors).toBe(0);
    expect(state.protocolSupportLoading).toBe(false);
  });

  it('records unexpected connection failures', () => {
    const error = new Error('connection failed');
    const state = connectionReducer(
      { ...initialConnectionState, connection: 'connecting' },
      { type: 'FAIL', unauthorized: false, error },
    );

    expect(state.error).toBe(error);
    expect(state.errors).toBe(1);
    expect(state.authOpen).toBe(false);
  });
});
