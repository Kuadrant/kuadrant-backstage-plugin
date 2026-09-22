import * as React from 'react';
import { useCallback } from 'react';
import {
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
} from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';
import RefreshIcon from '@material-ui/icons/Refresh';
import { McpTool } from './client';
import { MetadataRow } from './toolState';
import { useMcpInspectorStyles } from './styles';
import { serverNameForTool } from './utils';
import { ToolForm } from './ToolForm';

interface ToolPanelProps {
  tools: McpTool[];
  registrations: Array<{
    metadata: { name: string };
    spec?: { prefix?: string };
  }>;
  selectedToolName: string;
  search: string;
  rawValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  metadata: MetadataRow[];
  busy: boolean;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  onSelectTool: (tool: McpTool) => void;
  onRawValueChange: (name: string, value: string) => void;
  onAddMetadata: () => void;
  onUpdateMetadata: (id: number, field: 'key' | 'value', value: string) => void;
  onRemoveMetadata: (id: number) => void;
  onValidate: () => void;
  onRun: () => void;
}

interface ToolListItemProps {
  tool: McpTool;
  registrations: Array<{
    metadata: { name: string };
    spec?: { prefix?: string };
  }>;
  selected: boolean;
  selectedClassName: string;
  onSelect: (tool: McpTool) => void;
}

const ToolListItem = ({
  tool,
  registrations,
  selected,
  selectedClassName,
  onSelect,
}: ToolListItemProps) => {
  const handleSelect = useCallback(() => onSelect(tool), [onSelect, tool]);
  return (
    <ListItem
      button
      selected={selected}
      className={selected ? selectedClassName : undefined}
      onClick={handleSelect}
    >
      <ListItemText
        primary={tool.name}
        secondary={serverNameForTool(tool.name, registrations) || 'MCP server'}
      />
    </ListItem>
  );
};

export const ToolPanel = ({
  tools,
  registrations,
  selectedToolName,
  search,
  rawValues,
  fieldErrors,
  metadata,
  busy,
  onSearchChange,
  onRefresh,
  onSelectTool,
  onRawValueChange,
  onAddMetadata,
  onUpdateMetadata,
  onRemoveMetadata,
  onValidate,
  onRun,
}: ToolPanelProps) => {
  const classes = useMcpInspectorStyles();
  const selectedTool = tools.find((tool) => tool.name === selectedToolName);
  const filteredTools = tools.filter((tool) =>
    `${tool.name} ${serverNameForTool(tool.name, registrations)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onSearchChange(event.target.value),
    [onSearchChange],
  );

  return (
    <InfoCard title='Select a tool' className={classes.panel}>
      <div className={classes.toolbar}>
        <TextField
          label='Search tools'
          value={search}
          onChange={handleSearchChange}
          variant='outlined'
          size='small'
          className={classes.grow}
        />
        <IconButton
          aria-label='Refresh tools'
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshIcon />
        </IconButton>
      </div>
      <List className={classes.toolList} aria-label='Available tools'>
        {filteredTools.map((tool) => (
          <ToolListItem
            key={tool.name}
            tool={tool}
            registrations={registrations}
            selected={tool.name === selectedToolName}
            selectedClassName={classes.selectedTool}
            onSelect={onSelectTool}
          />
        ))}
        {filteredTools.length === 0 && (
          <ListItem>
            <ListItemText primary='No tools found' />
          </ListItem>
        )}
      </List>

      {selectedTool && (
        <ToolForm
          tool={selectedTool}
          registrations={registrations}
          rawValues={rawValues}
          fieldErrors={fieldErrors}
          metadata={metadata}
          busy={busy}
          onRawValueChange={onRawValueChange}
          onAddMetadata={onAddMetadata}
          onUpdateMetadata={onUpdateMetadata}
          onRemoveMetadata={onRemoveMetadata}
          onValidate={onValidate}
          onRun={onRun}
        />
      )}
    </InfoCard>
  );
};
