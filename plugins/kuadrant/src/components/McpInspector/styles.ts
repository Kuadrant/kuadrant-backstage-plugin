import { makeStyles } from '@material-ui/core';

export const useMcpInspectorStyles = makeStyles((theme) => ({
  connectionCard: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    boxShadow: 'none',
    '& .MuiCardContent-root': {
      padding: theme.spacing(1.5),
      '&:last-child': { paddingBottom: theme.spacing(1.5) },
    },
  },
  connectionBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(2),
    minHeight: 48,
  },
  gatewaySelect: { minWidth: 280, flex: '0 1 280px' },
  protocolSelect: { minWidth: 220, flex: '0 1 250px' },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    whiteSpace: 'nowrap',
  },
  statusDot: { width: 10, height: 10, borderRadius: '50%', flex: '0 0 auto' },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  stat: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  requestsIcon: { color: '#3e8635' },
  warningIcon: { color: '#f0ab00' },
  errorIcon: { color: '#c9190b' },
  authIcon: { color: '#3e8635 !important' },
  authChip: { transform: 'translateY(2px)' },
  emptyState: { padding: theme.spacing(8, 2), textAlign: 'center' },
  panel: { height: '100%' },
  toolList: {
    maxHeight: 260,
    overflowY: 'auto',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  selectedTool: { backgroundColor: theme.palette.action.selected },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
  },
  grow: { flexGrow: 1 },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    margin: theme.spacing(1, 0),
  },
  field: { marginTop: theme.spacing(2) },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    marginTop: theme.spacing(3),
  },
  metadataRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  code: {
    padding: theme.spacing(2),
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: theme.palette.type === 'dark' ? '#1b1d21' : '#f5f5f5',
    borderRadius: theme.shape.borderRadius,
  },
  result: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  outputSummary: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  successChip: {
    backgroundColor: '#3e8635',
    color: '#fff',
    transform: 'translateY(2px)',
  },
  errorChip: {
    backgroundColor: '#c9190b',
    color: '#fff',
    transform: 'translateY(2px)',
  },
}));

export type McpInspectorClasses = ReturnType<typeof useMcpInspectorStyles>;
