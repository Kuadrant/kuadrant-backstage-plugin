import React from 'react';
import { Box, Typography, Chip, useTheme } from '@material-ui/core';
import { Alert } from '@material-ui/lab';

interface PlanPolicyDetailsProps {
  selectedPolicy: {
    metadata: {
      name: string;
    };
    plans?: Array<{
      tier: string;
      description?: string;
      limits?: {
        daily?: number;
        monthly?: number;
        yearly?: number;
      };
    }>;
  } | null;
  alertSeverity?: 'warning' | 'info';
  alertMessage?: string;
  includeTopMargin?: boolean;
}

export const PlanPolicyDetails: React.FC<PlanPolicyDetailsProps> = ({
  selectedPolicy,
  alertSeverity = 'warning',
  alertMessage = 'No PlanPolicy found for this HTTPRoute. API keys and rate limiting may not be available.',
  includeTopMargin = true,
}) => {
  const theme = useTheme();
  return (
    <Box
      mt={includeTopMargin ? 1 : 0}
      p={2}
      bgcolor={theme.palette.background.default}
      borderRadius={1}
      border={`1px solid ${theme.palette.divider}`}
    >
      {selectedPolicy ? (
        <>
          <Typography variant="subtitle2" gutterBottom style={{ fontWeight: 600 }}>
            Associated PlanPolicy: <strong>{selectedPolicy.metadata.name}</strong>
          </Typography>

          {selectedPolicy.plans && selectedPolicy.plans.length > 0 ? (
            <>
              <Typography
                variant="caption"
                display="block"
                gutterBottom
                color="textSecondary"
                style={{ marginTop: 8 }}
              >
                Available Plans:
              </Typography>
              <Box display="flex" flexWrap="wrap" mt={1} style={{ gap: 8 }}>
                {selectedPolicy.plans.map((plan: any, idx: number) => {
                  const limitText = plan.limits?.daily
                    ? `${plan.limits.daily}/day`
                    : plan.limits?.monthly
                      ? `${plan.limits.monthly}/month`
                      : plan.limits?.yearly
                        ? `${plan.limits.yearly}/year`
                        : 'No limit';

                  return (
                    <Chip
                      key={idx}
                      label={`${plan.tier}: ${limitText}`}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  );
                })}
              </Box>
            </>
          ) : (
            <Typography variant="caption" color="textSecondary">
              No plans defined in this PlanPolicy
            </Typography>
          )}
        </>
      ) : (
        <Alert severity={alertSeverity}>{alertMessage}</Alert>
      )}
    </Box>
  );
};

