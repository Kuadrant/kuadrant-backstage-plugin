import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import CloseIcon from '@material-ui/icons/Close';
import RefreshIcon from '@material-ui/icons/Refresh';
import { McpClient, McpPrompt } from './client';

const useStyles = makeStyles(theme => ({
  banner: { border: '2px solid #6750c9', borderRadius: 14, padding: theme.spacing(1.5, 2), display: 'flex', alignItems: 'center', gap: theme.spacing(1), marginBottom: theme.spacing(3) },
  panel: { border: `1px solid ${theme.palette.divider}`, borderRadius: 12, padding: theme.spacing(2), height: '100%', boxSizing: 'border-box' },
  promptCard: { padding: theme.spacing(2, 0), borderBottom: `1px solid ${theme.palette.divider}` },
  output: { minHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'monospace', fontSize: 14, padding: theme.spacing(2), border: `1px solid ${theme.palette.divider}` },
}));

interface PromptsPanelProps {
  connected: boolean;
  execute: <T>(operation: (client: McpClient) => Promise<T>) => Promise<T | undefined>;
}

const emptyOutput = 'Generated prompt output will appear here.';

export const PromptsPanel = ({ connected, execute }: PromptsPanelProps) => {
  const classes = useStyles();
  const [prompts, setPrompts] = useState<McpPrompt[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState(emptyOutput);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [copyError, setCopyError] = useState<string>();

  const selectedPrompt = useMemo(() => prompts.find(prompt => prompt.name === selectedName), [prompts, selectedName]);

  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;
    setLoading(true);
    void execute(client => client.listPrompts()).then(result => {
      if (cancelled || result === undefined) return;
      const next = result;
      setPrompts(next);
      setSelectedName(next[0]?.name || '');
      setValues({});
      setOutput(emptyOutput);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [connected, execute, refresh]);

  const generate = async () => {
    if (!selectedPrompt) return;
    setGenerating(true);
    try {
      const result = await execute(client => client.getPrompt(selectedPrompt.name, values));
      if (result === undefined) return;
      const text = result?.messages?.map(message => message.content?.text || JSON.stringify(message.content)).join('\n\n');
      setOutput(text || emptyOutput);
    } finally { setGenerating(false); }
  };

  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(text);
      setCopyError(undefined);
    } catch {
      setCopyError('Unable to copy output to the clipboard.');
    }
  };

  return (<>
    {noticeVisible && <Box className={classes.banner}>
      <InfoOutlinedIcon color='primary' />
      <Typography><strong>Generating prompts creates text templates only and does not execute commands</strong></Typography>
      <Box flexGrow={1} />
      <Tooltip title='Dismiss notice'><IconButton size='small' aria-label='Dismiss prompt notice' onClick={() => setNoticeVisible(false)}><CloseIcon /></IconButton></Tooltip>
    </Box>}
    <Grid container spacing={3} alignItems='stretch'>
      <Grid item xs={12} md={6}>
        <Paper className={classes.panel} elevation={0}>
          <Box display='flex' alignItems='center' mb={2}><Typography variant='h6'>Select a prompt</Typography><Box flexGrow={1} /><Tooltip title='Refresh prompts'><IconButton size='small' onClick={() => setRefresh(value => value + 1)}><RefreshIcon /></IconButton></Tooltip></Box>
          <TextField select fullWidth size='small' variant='outlined' label='Prompt' value={selectedName} onChange={event => { setSelectedName(event.target.value); setValues({}); setOutput(emptyOutput); }} disabled={loading || !prompts.length}>
            {prompts.map(prompt => <MenuItem key={prompt.name} value={prompt.name}>{prompt.name}</MenuItem>)}
            {!loading && !prompts.length && <MenuItem disabled>No prompts found</MenuItem>}
          </TextField>
          {loading && <Box py={3} textAlign='center'><CircularProgress size={24} /></Box>}
          {!loading && !prompts.length && <Typography color='textSecondary' variant='body2' style={{ marginTop: 8 }}>This Gateway has no prompts registered.</Typography>}
          {selectedPrompt && <Box className={classes.promptCard}><Typography variant='h6'>✦ {selectedPrompt.name}</Typography><Typography variant='body2' color='textSecondary'>{selectedPrompt.description || 'No description provided.'}</Typography></Box>}
          {selectedPrompt?.arguments?.map(argument => <TextField key={argument.name} fullWidth margin='normal' label={`${argument.name}${argument.required ? ' *' : ''}`} value={values[argument.name] || ''} onChange={event => setValues({ ...values, [argument.name]: event.target.value })} helperText={argument.description} />)}
          <Box mt={2}><Button variant='contained' color='primary' onClick={() => void generate()} disabled={!selectedPrompt || generating}>{generating ? 'Generating…' : 'Generate prompt'}</Button><Button onClick={() => { setValues({}); setOutput(emptyOutput); }} style={{ marginLeft: 16 }}>Clear fields</Button></Box>
        </Paper>
      </Grid>
      <Grid item xs={12} md={6}>
        <Paper className={classes.panel} elevation={0}><Box display='flex' alignItems='center' mb={2}><Typography variant='h6'>Output</Typography><Box flexGrow={1} /><Tooltip title='Copy output'><IconButton size='small' onClick={() => void copy(output)}><FileCopyOutlinedIcon /></IconButton></Tooltip></Box>{copyError && <Alert severity='error' role='alert'>{copyError}</Alert>}<Box className={classes.output}>{output}</Box><Typography variant='body2' style={{ marginTop: 16 }}><strong>Token count:</strong> ~{Math.max(1, Math.ceil(output.length / 4))}</Typography></Paper>
      </Grid>
    </Grid>
  </>);
};
