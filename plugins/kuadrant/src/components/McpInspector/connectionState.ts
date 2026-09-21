import { McpProtocolMode } from './client';

export interface ConnectionState {
  selectedGateway: string;
  protocolMode: McpProtocolMode;
  supportedProtocols?: string[];
  protocolSupportLoading: boolean;
  connection: 'disconnected' | 'connecting' | 'connected';
  error?: Error;
  authOpen: boolean;
  authToken: string;
  showAuthToken: boolean;
  requests: number;
  warnings: number;
  errors: number;
}

export const initialConnectionState: ConnectionState = {
  selectedGateway: '',
  protocolMode: 'auto',
  protocolSupportLoading: false,
  connection: 'disconnected',
  authOpen: false,
  authToken: '',
  showAuthToken: false,
  requests: 0,
  warnings: 0,
  errors: 0,
};

export type ConnectionAction =
  | { type: 'SELECT_GATEWAY'; gateway: string }
  | { type: 'SET_PROTOCOL_MODE'; mode: McpProtocolMode }
  | { type: 'START'; gateway: string; protocol: McpProtocolMode }
  | { type: 'SUCCEED'; protocols?: string[] }
  | { type: 'FAIL'; error?: Error; unauthorized: boolean }
  | { type: 'SET_ERROR'; error: Error }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_AUTH_TOKEN'; token: string }
  | { type: 'SET_SHOW_AUTH_TOKEN'; show: boolean }
  | { type: 'SET_AUTH_OPEN'; open: boolean }
  | { type: 'RESET_COUNTERS' }
  | { type: 'REQUEST' }
  | { type: 'WARNING' }
  | { type: 'ERROR' };

export const connectionReducer = (
  state: ConnectionState,
  action: ConnectionAction,
): ConnectionState => {
  switch (action.type) {
    case 'SELECT_GATEWAY':
      return {
        ...initialConnectionState,
        selectedGateway: action.gateway,
        protocolMode: state.protocolMode,
      };
    case 'SET_PROTOCOL_MODE':
      return { ...state, protocolMode: action.mode };
    case 'START':
      return {
        ...state,
        selectedGateway: action.gateway,
        protocolMode: action.protocol,
        connection: 'connecting',
        protocolSupportLoading: true,
        error: undefined,
        authOpen: false,
      };
    case 'SUCCEED':
      return {
        ...state,
        connection: 'connected',
        protocolSupportLoading: false,
        supportedProtocols: action.protocols || state.supportedProtocols,
        authOpen: false,
        error: undefined,
      };
    case 'FAIL':
      return {
        ...state,
        connection: 'disconnected',
        protocolSupportLoading: false,
        authOpen: action.unauthorized,
        error: action.unauthorized ? undefined : action.error,
        errors: action.unauthorized ? state.errors : state.errors + 1,
      };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: undefined };
    case 'SET_AUTH_TOKEN':
      return { ...state, authToken: action.token };
    case 'SET_SHOW_AUTH_TOKEN':
      return { ...state, showAuthToken: action.show };
    case 'SET_AUTH_OPEN':
      return { ...state, authOpen: action.open };
    case 'RESET_COUNTERS':
      return { ...state, requests: 0, warnings: 0, errors: 0 };
    case 'REQUEST':
      return { ...state, requests: state.requests + 1 };
    case 'WARNING':
      return { ...state, warnings: state.warnings + 1 };
    case 'ERROR':
      return { ...state, errors: state.errors + 1 };
    default:
      return state;
  }
};
