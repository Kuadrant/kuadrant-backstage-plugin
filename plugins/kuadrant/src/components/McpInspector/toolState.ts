import { McpExchange, McpTool, ToolsCallResult } from './client';

export interface MetadataRow {
  id: number;
  key: string;
  value: string;
}

export interface ToolState {
  tools: McpTool[];
  selectedToolName: string;
  search: string;
  rawValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  validationMessage: string;
  metadata: MetadataRow[];
  exchange?: McpExchange<ToolsCallResult>;
  outputTab: number;
  busy: boolean;
}

export const initialToolState: ToolState = {
  tools: [],
  selectedToolName: '',
  search: '',
  rawValues: {},
  fieldErrors: {},
  validationMessage: '',
  metadata: [],
  outputTab: 0,
  busy: false,
};

export type ToolAction =
  | { type: 'RESET' }
  | { type: 'SET_TOOLS'; tools: McpTool[] }
  | { type: 'SELECT'; name: string; rawValues: Record<string, string> }
  | { type: 'SET_SEARCH'; search: string }
  | { type: 'SET_VALUE'; name: string; value: string }
  | { type: 'SET_FIELD_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_VALIDATION_MESSAGE'; message: string }
  | { type: 'ADD_METADATA'; row: MetadataRow }
  | {
      type: 'UPDATE_METADATA';
      id: number;
      field: 'key' | 'value';
      value: string;
    }
  | { type: 'REMOVE_METADATA'; id: number }
  | { type: 'SET_EXCHANGE'; exchange?: McpExchange<ToolsCallResult> }
  | { type: 'SET_OUTPUT_TAB'; tab: number }
  | { type: 'SET_BUSY'; busy: boolean };

export const toolReducer = (
  state: ToolState,
  action: ToolAction,
): ToolState => {
  switch (action.type) {
    case 'RESET':
      return { ...initialToolState, search: state.search };
    case 'SET_TOOLS':
      return { ...state, tools: action.tools };
    case 'SELECT':
      return {
        ...state,
        selectedToolName: action.name,
        rawValues: action.rawValues,
        fieldErrors: {},
        validationMessage: '',
        metadata: [],
        exchange: undefined,
      };
    case 'SET_SEARCH':
      return { ...state, search: action.search };
    case 'SET_VALUE':
      return {
        ...state,
        rawValues: { ...state.rawValues, [action.name]: action.value },
      };
    case 'SET_FIELD_ERRORS':
      return { ...state, fieldErrors: action.errors };
    case 'SET_VALIDATION_MESSAGE':
      return { ...state, validationMessage: action.message };
    case 'ADD_METADATA':
      return { ...state, metadata: [...state.metadata, action.row] };
    case 'UPDATE_METADATA':
      return {
        ...state,
        metadata: state.metadata.map((row) =>
          row.id === action.id ? { ...row, [action.field]: action.value } : row,
        ),
      };
    case 'REMOVE_METADATA':
      return {
        ...state,
        metadata: state.metadata.filter((row) => row.id !== action.id),
      };
    case 'SET_EXCHANGE':
      return { ...state, exchange: action.exchange };
    case 'SET_OUTPUT_TAB':
      return { ...state, outputTab: action.tab };
    case 'SET_BUSY':
      return { ...state, busy: action.busy };
    default:
      return state;
  }
};
