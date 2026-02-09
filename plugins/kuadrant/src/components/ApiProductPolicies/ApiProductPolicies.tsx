import React from 'react';
import { Box, Grid, Typography, Chip, useTheme } from '@material-ui/core';
import { StatusCondition } from "../../types/api-management";

interface ApiProductPoliciesProps {
  planPolicyCondition?: StatusCondition | null;
  discoveredPlans?: Array<{
    tier: string;
    limits?: {
      daily?: number;
      monthly?: number;
      yearly?: number;
    };
  }> | null;
  includeTopMargin?: boolean;
}
// Displays APIProduct policies
export const ApiProductPolicies: React.FC<ApiProductPoliciesProps> = ({
  planPolicyCondition,
  discoveredPlans,
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
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Plan Policy
          </Typography>
          {planPolicyCondition ? (
            <Box>
              <Chip
                label={planPolicyCondition.reason}
                size="small"
                style={{
                  backgroundColor: planPolicyCondition.status === "True" ? "#4caf50" : "#ff9800",
                  color: "#fff",
                  marginBottom: 8,
                }}
              />
              {planPolicyCondition.status === "False" && (
                <Typography variant="body2">
                  {planPolicyCondition.message || "No details available"}
                </Typography>
              )}
              {discoveredPlans && discoveredPlans.length > 0 && (
                <>
                  <Typography
                    variant="caption"
                    display="block"
                    gutterBottom
                    color="textSecondary"
                    style={{ marginTop: 8 }}
                  >
                    Available PlanPolicy Tiers:
                  </Typography>
                  <Box display="flex" flexWrap="wrap" mt={1} style={{ gap: 8 }}>
                    {discoveredPlans.map((plan: any, idx: number) => {
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
              )}
            </Box>
          ) : (
            <Typography variant="body2">No plan policy information</Typography>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
