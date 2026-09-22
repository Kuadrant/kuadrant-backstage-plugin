import * as React from 'react';
import { useCallback } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import { McpTool } from './client';
import { MetadataRow } from './toolState';
import { useMcpInspectorStyles } from './styles';
import { humanize, serverNameForTool } from './utils';

interface ToolFormProps {
  tool: McpTool;
  registrations: Array<{
    metadata: { name: string };
    spec?: { prefix?: string };
  }>;
  rawValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  metadata: MetadataRow[];
  busy: boolean;
  onRawValueChange: (name: string, value: string) => void;
  onAddMetadata: () => void;
  onUpdateMetadata: (id: number, field: 'key' | 'value', value: string) => void;
  onRemoveMetadata: (id: number) => void;
  onValidate: () => void;
  onRun: () => void;
}

const annotationLabels = (tool: McpTool): string[] =>
  Object.entries(tool.annotations || {})
    .filter(([, value]) => value === true)
    .map(([name]) => humanize(name.replace(/Hint$/, '')));

export const ToolForm = ({
  tool,
  registrations,
  rawValues,
  fieldErrors,
  metadata,
  busy,
  onRawValueChange,
  onAddMetadata,
  onUpdateMetadata,
  onRemoveMetadata,
  onValidate,
  onRun,
}: ToolFormProps) => {
  const classes = useMcpInspectorStyles();
  const serverName = serverNameForTool(tool.name, registrations);
  const handleCopyName = useCallback(
    () => void navigator.clipboard?.writeText(tool.name),
    [tool.name],
  );

  return (
    <Box mt={3}>
      <Box display='flex' alignItems='center'>
        <div className={classes.grow}>
          <Typography variant='h5'>{tool.name}</Typography>
          <Typography color='textSecondary'>
            {serverName || 'MCP server'}
          </Typography>
        </div>
        <IconButton aria-label='Copy tool name' onClick={handleCopyName}>
          <FileCopyIcon />
        </IconButton>
      </Box>
      <div className={classes.chips}>
        {annotationLabels(tool).map((label) => (
          <Chip key={label} size='small' label={label} />
        ))}
      </div>
      {tool.description && <Typography>{tool.description}</Typography>}
      <Divider className={classes.field} />
      {Object.entries(tool.inputSchema?.properties || {}).map(
        ([name, schema]) => {
          const required = tool.inputSchema?.required?.includes(name);
          const handleChange = (
            event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => onRawValueChange(name, event.target.value);
          if (schema.type === 'boolean') {
            return (
              <TextField
                select
                fullWidth
                key={name}
                label={`${schema.title || humanize(name)}${required ? ' *' : ''}`}
                value={rawValues[name] ?? ''}
                onChange={handleChange}
                helperText={fieldErrors[name] || schema.description}
                error={!!fieldErrors[name]}
                className={classes.field}
              >
                <MenuItem value=''>Not set</MenuItem>
                <MenuItem value='true'>True</MenuItem>
                <MenuItem value='false'>False</MenuItem>
              </TextField>
            );
          }
          return (
            <TextField
              fullWidth
              key={name}
              select={!!schema.enum}
              label={`${schema.title || humanize(name)}${required ? ' *' : ''}`}
              value={rawValues[name] ?? ''}
              onChange={handleChange}
              helperText={fieldErrors[name] || schema.description}
              error={!!fieldErrors[name]}
              multiline={schema.type === 'object' || schema.type === 'array'}
              minRows={
                schema.type === 'object' || schema.type === 'array'
                  ? 3
                  : undefined
              }
              className={classes.field}
            >
              {(schema.enum || []).map((option) => (
                <MenuItem key={String(option)} value={String(option)}>
                  {String(option)}
                </MenuItem>
              ))}
            </TextField>
          );
        },
      )}
      <Box mt={3}>
        <Button startIcon={<AddIcon />} onClick={onAddMetadata}>
          Add tool-specific metadata
        </Button>
        {metadata.map((row) => (
          <div key={row.id} className={classes.metadataRow}>
            <TextField
              label='Key'
              value={row.key}
              onChange={(event) =>
                onUpdateMetadata(row.id, 'key', event.target.value)
              }
            />
            <TextField
              label='Value'
              value={row.value}
              onChange={(event) =>
                onUpdateMetadata(row.id, 'value', event.target.value)
              }
            />
            <IconButton
              aria-label='Remove metadata'
              onClick={() => onRemoveMetadata(row.id)}
            >
              <DeleteIcon />
            </IconButton>
          </div>
        ))}
      </Box>
      <div className={classes.actions}>
        <Tooltip title='Checks required fields and input types locally without calling the MCP server.'>
          <Button variant='outlined' onClick={onValidate}>
            Validate only
          </Button>
        </Tooltip>
        <Button
          color='primary'
          variant='contained'
          onClick={onRun}
          disabled={busy}
        >
          {busy ? 'Running…' : 'Run tool'}
        </Button>
      </div>
    </Box>
  );
};
