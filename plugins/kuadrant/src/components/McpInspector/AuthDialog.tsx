import * as React from 'react';
import { useCallback } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@material-ui/core';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';

interface AuthDialogProps {
  open: boolean;
  token: string;
  showToken: boolean;
  onClose: () => void;
  onTokenChange: (token: string) => void;
  onShowTokenChange: (show: boolean) => void;
  onConnect: () => void;
}

export const AuthDialog = ({
  open,
  token,
  showToken,
  onClose,
  onTokenChange,
  onShowTokenChange,
  onConnect,
}: AuthDialogProps) => {
  const handleTokenChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onTokenChange(event.target.value),
    [onTokenChange],
  );
  const handleShowTokenChange = useCallback(
    () => onShowTokenChange(!showToken),
    [onShowTokenChange, showToken],
  );

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Authenticate with MCP gateway</DialogTitle>
      <DialogContent>
        <Typography gutterBottom>
          Enter a bearer token for the selected MCP gateway. It is kept in
          memory only and is not stored by Backstage.
        </Typography>
        <TextField
          fullWidth
          type={showToken ? 'text' : 'password'}
          label='Bearer token'
          helperText='Paste the token value; an optional Bearer prefix is accepted.'
          value={token}
          onChange={handleTokenChange}
          InputProps={{
            endAdornment: (
              <IconButton
                aria-label={
                  showToken ? 'Hide bearer token' : 'Show bearer token'
                }
                onClick={handleShowTokenChange}
                edge='end'
              >
                {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            ),
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color='primary'
          variant='contained'
          disabled={!token.trim()}
          onClick={onConnect}
        >
          Connect
        </Button>
      </DialogActions>
    </Dialog>
  );
};
