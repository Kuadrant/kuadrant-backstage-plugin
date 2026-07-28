import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from "@material-ui/core";
import { useApi } from "@backstage/core-plugin-api";
import { kuadrantApiRef } from '../../api';
import { APIKey } from "../../types/api-management";
import { formatPlanLimits } from '../../utils/policies';
import { useDatePickerStyles } from '../../utils/styles';
import { isCustomDateInvalid, customDateToISO } from '../../utils/apikeys';

interface EditAPIKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  request: APIKey;
  availablePlans: Array<{
    tier: string;
    description?: string;
    limits?: any;
  }>;
}

export const EditAPIKeyDialog = ({
  open,
  onClose,
  onSuccess,
  request,
  availablePlans,
}: EditAPIKeyDialogProps) => {
  const classes = useDatePickerStyles();
  const kuadrantApi = useApi(kuadrantApiRef);

  const [planTier, setPlanTier] = useState("");
  const [useCase, setUseCase] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && request) {
      setPlanTier(request.spec.planTier || "");
      setUseCase(request.spec.useCase || "");
      setError("");
      // initialise expiry from existing spec
      if (request.spec.expiresAt) {
        setExpiryDays("custom");
        setCustomDate(request.spec.expiresAt.split("T")[0]);
      } else {
        setExpiryDays("");
        setCustomDate("");
      }
    }
  }, [open, request]);

  const handleSave = async () => {
    if (!planTier) {
      setError("Please select a tier");
      return;
    }

    setError("");
    setSaving(true);

    let expiresAt: string | undefined;
    if (expiryDays === 'custom' && customDate) {
      expiresAt = customDateToISO(customDate);
    } else if (expiryDays) {
      expiresAt = new Date(Date.now() + parseInt(expiryDays, 10) * 86400000).toISOString();
    }

    try {
      const patch = {
        spec: {
          planTier,
          useCase: useCase.trim(),
          // null explicitly removes the field in Kubernetes JSON Merge Patch
          expiresAt: expiryDays === '' ? null : expiresAt,
        },
      };

      await kuadrantApi.updateRequest(
        request.metadata.name,
        request.metadata.namespace,
        // @ts-ignore Applying a partial obj
        patch,
      );

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating API key request:", err);
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setError("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit API Key</DialogTitle>
      <DialogContent>
        {error && (
          <Box
            mb={2}
            p={2}
            bgcolor="error.main"
            color="error.contrastText"
            borderRadius={1}
          >
            <Typography variant="body2">{error}</Typography>
          </Box>
        )}

        <FormControl fullWidth margin="normal">
          <InputLabel>Tier</InputLabel>
          <Select
            value={planTier}
            onChange={(e) => setPlanTier(e.target.value as string)}
            disabled={saving}
          >
            {availablePlans.map((plan) => {
              const limitDesc = formatPlanLimits(plan.limits);
              return (
                <MenuItem key={plan.tier} value={plan.tier}>
                  {plan.tier} {limitDesc ? `(${limitDesc})` : ""}
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>

        <TextField
          label="Use Case"
          placeholder="Describe how you plan to use this API"
          multiline
          rows={3}
          fullWidth
          margin="normal"
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
          disabled={saving}
          helperText="Explain your intended use of this API for admin review"
        />

        <FormControl fullWidth margin="normal" disabled={saving}>
          <InputLabel id="edit-expiry-select-label">Expiration (optional)</InputLabel>
          <Select
            labelId="edit-expiry-select-label"
            value={expiryDays}
            onChange={(e) => {
              setExpiryDays(e.target.value as string);
              setCustomDate("");
            }}
          >
            <MenuItem value="">No expiration</MenuItem>
            {[7, 30, 60, 90].map(days => {
              const date = new Date(Date.now() + days * 86400000);
              return (
                <MenuItem key={days} value={String(days)}>
                  {days} days ({date.toLocaleDateString()})
                </MenuItem>
              );
            })}
            <MenuItem value="custom">Custom</MenuItem>
          </Select>
        </FormControl>
        {expiryDays === "custom" && (
          <TextField
            label="Select date"
            type="date"
            fullWidth
            margin="normal"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={saving}
            inputProps={{ min: new Date(Date.now() + 86400000).toISOString().split("T")[0] }}
            className={classes.datePicker}
            error={isCustomDateInvalid(expiryDays, customDate)}
            helperText={isCustomDateInvalid(expiryDays, customDate) ? 'Expiration date must be in the future' : undefined}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={!planTier || saving || isCustomDateInvalid(expiryDays, customDate)}
          startIcon={
            saving ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
