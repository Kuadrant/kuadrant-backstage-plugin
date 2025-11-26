import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  CircularProgress,
} from '@material-ui/core';
import WarningIcon from '@material-ui/icons/Warning';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  // for dangerous deletes, require typing this text to confirm
  confirmText?: string;
  // severity affects styling - 'high' shows warning icon and requires text confirmation
  severity?: 'normal' | 'high';
  deleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteDialog = ({
  open,
  title,
  description,
  confirmText,
  severity = 'normal',
  deleting = false,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) => {
  const [inputValue, setInputValue] = useState('');

  // reset input when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setInputValue('');
    }
  }, [open]);

  const requiresTextConfirmation = severity === 'high' && confirmText;
  const canConfirm = requiresTextConfirmation ? inputValue === confirmText : true;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={deleting ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {severity === 'high' && (
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <WarningIcon color="error" />
            <span>{title}</span>
          </Box>
        )}
        {severity !== 'high' && title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
        {requiresTextConfirmation && (
          <Box mt={2}>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Type <strong>{confirmText}</strong> to confirm:
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              size="small"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={deleting}
              autoFocus
              placeholder={confirmText}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          color="secondary"
          variant="contained"
          disabled={deleting || !canConfirm}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
