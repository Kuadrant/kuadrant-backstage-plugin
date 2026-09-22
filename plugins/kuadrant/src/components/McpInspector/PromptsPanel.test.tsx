import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PromptsPanel } from './PromptsPanel';
import { McpClient } from './client';

type Execute = <T>(
  operation: (mcpClient: McpClient) => Promise<T>,
) => Promise<T | undefined>;

describe('PromptsPanel', () => {
  it('loads prompts and generates output with entered arguments', async () => {
    const client = {
      listPrompts: jest.fn().mockResolvedValue([
        {
          name: 'greet',
          description: 'Greet a person by name',
          arguments: [{ name: 'name', description: 'Person to greet', required: true }],
        },
      ]),
      getPrompt: jest.fn().mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hello Alice' } }],
      }),
    } as unknown as McpClient;
    const execute = jest.fn(
      (operation: (mcpClient: McpClient) => Promise<unknown>) => operation(client),
    ) as unknown as Execute;

    render(createElement(PromptsPanel, { connected: true, execute }));

    expect(await screen.findByText('Greet a person by name')).toBeInTheDocument();
    const nameField = screen.getByRole('textbox');
    fireEvent.change(nameField, { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate prompt' }));

    await waitFor(() => expect(screen.getByText('Hello Alice')).toBeInTheDocument());
    expect(client.getPrompt).toHaveBeenCalledWith('greet', { name: 'Alice' });
    expect(screen.getByText(/Token count:/)).toBeInTheDocument();
  });

  it('shows an empty state when the gateway has no prompts', async () => {
    const client = {
      listPrompts: jest.fn().mockResolvedValue([]),
    } as unknown as McpClient;
    const execute = jest.fn(
      (operation: (mcpClient: McpClient) => Promise<unknown>) => operation(client),
    ) as unknown as Execute;

    render(createElement(PromptsPanel, { connected: true, execute }));

    expect(await screen.findByText('This Gateway has no prompts registered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate prompt' })).toBeDisabled();
  });

  it('preserves prompts when a refresh fails', async () => {
    const client = {
      listPrompts: jest.fn().mockResolvedValue([
        { name: 'greet', description: 'Greet a person by name' },
      ]),
    } as unknown as McpClient;
    let calls = 0;
    const execute = (async (operation: (mcpClient: McpClient) => Promise<unknown>) => {
      calls += 1;
      return calls === 1 ? operation(client) : undefined;
    }) as Execute;

    render(createElement(PromptsPanel, { connected: true, execute }));
    expect(await screen.findByText('Greet a person by name')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Refresh prompts'));

    await waitFor(() => expect(screen.getByText('greet')).toBeInTheDocument());
    expect(screen.queryByText('This Gateway has no prompts registered.')).not.toBeInTheDocument();
  });

  it('preserves generated output when generation fails', async () => {
    const client = {
      listPrompts: jest.fn().mockResolvedValue([
        { name: 'greet', arguments: [{ name: 'name' }] },
      ]),
      getPrompt: jest.fn().mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hello Alice' } }],
      }),
    } as unknown as McpClient;
    let calls = 0;
    const execute = (async (operation: (mcpClient: McpClient) => Promise<unknown>) => {
      calls += 1;
      return calls <= 2 ? operation(client) : undefined;
    }) as Execute;

    render(createElement(PromptsPanel, { connected: true, execute }));
    await screen.findByText('greet');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Alice' } });
    const generate = screen.getByRole('button', { name: 'Generate prompt' });
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getByText('Hello Alice')).toBeInTheDocument());

    fireEvent.click(generate);

    await waitFor(() => expect(screen.getByText('Hello Alice')).toBeInTheDocument());
  });

  it('reports clipboard failures', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    const execute = jest.fn() as unknown as Execute;
    render(createElement(PromptsPanel, { connected: false, execute }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy output' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to copy output to the clipboard.',
    );
  });

  it('dismisses the informational notice', () => {
    const execute = jest.fn() as unknown as Execute;
    render(createElement(PromptsPanel, { connected: false, execute }));

    expect(
      screen.getByText('Generating prompts creates text templates only and does not execute commands'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss prompt notice' }));
    expect(
      screen.queryByText('Generating prompts creates text templates only and does not execute commands'),
    ).not.toBeInTheDocument();
  });
});
