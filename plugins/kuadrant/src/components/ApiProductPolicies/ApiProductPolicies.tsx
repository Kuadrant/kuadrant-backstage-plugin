import React from 'react';
import { Box, Grid, Typography, Chip, useTheme } from '@material-ui/core';
import { StatusCondition } from "../../types/api-management";

export type PlanPoliciesProps = {
  statusCondition: StatusCondition | null;
  discoveredPlans: Array<{
    tier: string;
    limits?: {
      daily?: number;
      monthly?: number;
      yearly?: number;
    };
  }>
};

export type AuthPoliciesProps = {
  namespacedName: {
    name: string | null;
    namespace: string | null;
  } | null;
  statusCondition: StatusCondition | null;
};

interface ApiProductPoliciesProps {
  planPolicy: PlanPoliciesProps | null;
  authPolicy: AuthPoliciesProps | null;
  includeTopMargin?: boolean;
}
// Displays APIProduct policies
export const ApiProductPolicies: React.FC<ApiProductPoliciesProps> = ({
  planPolicy,
  authPolicy,
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
          {planPolicy?.statusCondition ? (
            <Box>
              <Chip
                label={planPolicy.statusCondition.reason}
                size="small"
                style={{
                  backgroundColor: planPolicy.statusCondition.status === "True" ? "#4caf50" : "#ff9800",
                  color: "#fff",
                  marginBottom: 8,
                }}
              />
              {planPolicy.discoveredPlans && planPolicy.discoveredPlans.length > 0 && (
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
                    {planPolicy.discoveredPlans.map((plan: any, idx: number) => {
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
            <Chip
              label="NotFound"
              size="small"
              style={{
                backgroundColor: "#ff9800",
                color: "#fff",
                marginBottom: 8,
              }}
            />
          )}
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Auth Policy
          </Typography>
          {authPolicy?.statusCondition ? (
            <Box>
              <Chip
                label={authPolicy.statusCondition.reason}
                size="small"
                style={{
                  backgroundColor: authPolicy.statusCondition.status === "True" ? "#4caf50" : "#ff9800",
                  color: "#fff",
                  marginBottom: 8,
                }}
              />
              {authPolicy.statusCondition.status === "True" && (
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        Resource Name
                      </Typography>
                      <Typography variant="body2">
                        {authPolicy.namespacedName?.name || "No Auth Policy name available"}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        Resource Namespace
                      </Typography>
                      <Typography variant="body2">
                        {authPolicy.namespacedName?.namespace || "No Auth Policy namespace available"}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              )}
            </Box>
          ) : (
            <Chip
              label="NotFound"
              size="small"
              style={{
                backgroundColor: "#ff9800",
                color: "#fff",
                marginBottom: 8,
              }}
            />
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
