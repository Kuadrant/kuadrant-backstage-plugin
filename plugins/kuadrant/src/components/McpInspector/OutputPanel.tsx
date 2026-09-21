import * as React from 'react';
import { Box, Chip, Tab, Tabs, Typography } from '@material-ui/core';
import { InfoCard } from '@backstage/core-components';
import { McpExchange, ToolsCallResult } from './client';
import { useMcpInspectorStyles } from './styles';

interface OutputPanelProps {
  exchange?: McpExchange<ToolsCallResult>;
  validationMessage: string;
  outputTab: number;
  onOutputTabChange: (tab: number) => void;
}

const serverResultText = (result: ToolsCallResult): string => {
  if (!result.content?.length) return JSON.stringify(result, null, 2);
  return result.content
    .map((item) =>
      item.type === 'text' && typeof item.text === 'string'
        ? item.text
        : JSON.stringify(item, null, 2),
    )
    .join('\n\n');
};

export const OutputPanel = ({
  exchange,
  validationMessage,
  outputTab,
  onOutputTabChange,
}: OutputPanelProps) => {
  const classes = useMcpInspectorStyles();
  const handleTabChange = (_: React.ChangeEvent<{}>, tab: number) =>
    onOutputTabChange(tab);
  let outputContent = <Typography color='textSecondary'>No results</Typography>;
  if (exchange && outputTab === 0) {
    outputContent = (
      <>
        <Typography variant='h6'>JSON-RPC request</Typography>
        <pre className={classes.code}>
          {JSON.stringify(exchange.request, null, 2)}
        </pre>
        <Typography variant='h6'>JSON-RPC response</Typography>
        <pre className={classes.code}>
          {JSON.stringify(exchange.response, null, 2)}
        </pre>
      </>
    );
  } else if (exchange) {
    outputContent = (
      <Typography component='pre' className={classes.result}>
        {serverResultText(exchange.result)}
      </Typography>
    );
  } else if (validationMessage) {
    outputContent = (
      <>
        <Typography variant='h6'>Validation</Typography>
        <Typography>{validationMessage}</Typography>
      </>
    );
  }

  return (
    <InfoCard title='Output' className={classes.panel}>
      {exchange && (
        <div className={classes.outputSummary}>
          <Chip
            size='small'
            className={
              exchange.result.isError ? classes.errorChip : classes.successChip
            }
            label={`${exchange.result.isError ? 'Error' : 'Success'} ${exchange.status} ${exchange.statusText}`}
          />
          <Typography variant='body2'>TIME: {exchange.durationMs}ms</Typography>
        </div>
      )}
      <Tabs
        value={outputTab}
        onChange={handleTabChange}
        indicatorColor='primary'
        textColor='primary'
      >
        <Tab label='Console' />
        <Tab label='Server results' />
      </Tabs>
      <Box mt={2}>{outputContent}</Box>
    </InfoCard>
  );
};
