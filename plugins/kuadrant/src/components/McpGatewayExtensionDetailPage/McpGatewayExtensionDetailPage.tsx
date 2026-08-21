import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "@backstage/core-plugin-api";
import { kuadrantApiRef } from "../../api";
import { useAsync } from "react-use";
import {
  Header,
  Page,
  Content,
  ResponseErrorPanel,
  InfoCard,
  Link,
  Breadcrumbs,
  Table,
  TableColumn,
} from "@backstage/core-components";
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  Chip,
  makeStyles,
  Grid,
} from "@material-ui/core";
import { Skeleton } from "@material-ui/lab";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import { MCPGatewayExtension, McpCondition } from "../../types/mcp";
import { ResourceYamlCard } from "../ResourceYamlCard";
import { formatAge, formatOwner, isExtensionReady } from "./utils";

const useStyles = makeStyles((theme) => ({
  tabs: {
    marginLeft: theme.spacing(-3),
  },
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    fontSize: "0.75rem",
    textTransform: "uppercase",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  infoItem: {
    minWidth: 0,
  },
  statusChipReady: {
    backgroundColor: theme.palette.success.main,
    color: theme.palette.common.white,
  },
  statusChipNotReady: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.common.white,
  },
}));

export const McpGatewayExtensionDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const kuadrantApi = useApi(kuadrantApiRef);

  const [selectedTab, setSelectedTab] = useState(0);

  const {
    value: extension,
    loading,
    error,
  } = useAsync(async () => {
    return (await kuadrantApi.getMcpGatewayExtension(
      namespace!,
      name!,
    )) as MCPGatewayExtension;
  }, [namespace, name, kuadrantApi]);

  if (loading) {
    return (
      <Page themeId="tool">
        <Header title="Loading..." />
        <Content>
          <Box p={2}>
            {[...Array(5)].map((_, i) => (
              <Box key={i} p={2}>
                <Skeleton variant="text" width="100%" />
              </Box>
            ))}
          </Box>
        </Content>
      </Page>
    );
  }

  if (error || !extension) {
    return (
      <ResponseErrorPanel
        error={error || new Error("MCP Gateway Extension not found")}
      />
    );
  }

  const conditions = extension.status?.conditions || [];
  const ready = isExtensionReady(extension);
  const labels = extension.metadata?.labels || {};
  const annotations = extension.metadata?.annotations || {};
  const createdAt = extension.metadata?.creationTimestamp;
  const owner = formatOwner(extension);

  const conditionsColumns: TableColumn<McpCondition>[] = [
    {
      title: "Type",
      field: "type",
      render: (row) => <strong>{row.type}</strong>,
    },
    {
      title: "Status",
      field: "status",
      render: (row) => (
        <Chip
          label={row.status}
          size="small"
          style={{
            backgroundColor:
              row.status === "True" ? "var(--rh-green, #3e8635)" : undefined,
            color: row.status === "True" ? "white" : undefined,
          }}
        />
      ),
    },
    {
      title: "Updated",
      field: "lastTransitionTime",
      render: (row) => formatAge(row.lastTransitionTime),
    },
    {
      title: "Reason",
      field: "reason",
      render: (row) => row.reason || "-",
    },
    {
      title: "Message",
      field: "message",
      render: (row) => row.message || "-",
    },
  ];

  return (
    <Page themeId="tool">
      <Header
        title={extension.metadata?.name || "MCP Gateway Extension"}
        subtitle={`Namespace: ${extension.metadata?.namespace || "-"}`}
      >
        <Link to="/kuadrant/mcp-management">
          <Button startIcon={<ArrowBackIcon />}>Back to MCP Overview</Button>
        </Link>
      </Header>
      <Content>
        <Box mb={2}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/kuadrant/mcp-management">MCP Overview</Link>
            <Typography>
              {extension.metadata?.name || "Gateway Extension"}
            </Typography>
          </Breadcrumbs>
        </Box>

        <Box mb={2}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
            className={classes.tabs}
          >
            <Tab label="Details" />
            <Tab label="YAML" />
          </Tabs>
        </Box>

        {selectedTab === 0 && (
          <>
            <InfoCard title="Resource Details">
              <Box className={classes.infoGrid}>
                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Name
                  </Typography>
                  <Typography variant="body2">
                    {extension.metadata?.name || "-"}
                  </Typography>
                </Box>

                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Namespace
                  </Typography>
                  <Typography variant="body2">
                    {extension.metadata?.namespace || "-"}
                  </Typography>
                </Box>

                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Status
                  </Typography>
                  <Box>
                    <Chip
                      label={ready ? "Ready" : "Not Ready"}
                      size="small"
                      className={
                        ready
                          ? classes.statusChipReady
                          : classes.statusChipNotReady
                      }
                    />
                  </Box>
                </Box>

                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Created At
                  </Typography>
                  <Typography variant="body2">
                    {createdAt ? new Date(createdAt).toLocaleString() : "-"}
                  </Typography>
                </Box>

                {extension.metadata?.ownerReferences &&
                  extension.metadata.ownerReferences.length > 0 && (
                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Owner
                      </Typography>
                      <Typography variant="body2">{owner}</Typography>
                    </Box>
                  )}

                {extension.spec?.targetRef && (
                  <>
                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Target Gateway
                      </Typography>
                      <Typography variant="body2">
                        {extension.spec.targetRef.name || "-"}
                      </Typography>
                    </Box>

                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Target Group
                      </Typography>
                      <Typography variant="body2">
                        {extension.spec.targetRef.group ||
                          "gateway.networking.k8s.io"}
                      </Typography>
                    </Box>

                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Target Kind
                      </Typography>
                      <Typography variant="body2">
                        {extension.spec.targetRef.kind || "Gateway"}
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>

              {Object.keys(labels).length > 0 && (
                <Box mb={3}>
                  <Typography variant="caption" className={classes.label}>
                    Labels
                  </Typography>
                  <Grid container spacing={1}>
                    {Object.entries(labels).map(([key, value]) => (
                      <Grid item key={key}>
                        <Chip
                          label={`${key}: ${value}`}
                          size="small"
                          variant="outlined"
                        />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

              {Object.keys(annotations).length > 0 && (
                <Box mb={3}>
                  <Typography variant="caption" className={classes.label}>
                    Annotations
                  </Typography>
                  <Grid container spacing={1}>
                    {Object.entries(annotations).map(([key, value]) => (
                      <Grid item key={key} xs={12}>
                        <Typography
                          variant="body2"
                          style={{
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                          }}
                        >
                          <strong>{key}:</strong> {String(value)}
                        </Typography>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </InfoCard>

            {conditions.length > 0 && (
              <Box mt={3}>
                <InfoCard title="Conditions">
                  <Table<McpCondition>
                    options={{
                      paging: false,
                      search: false,
                      toolbar: false,
                    }}
                    columns={conditionsColumns}
                    data={conditions}
                  />
                </InfoCard>
              </Box>
            )}
          </>
        )}

        {selectedTab === 1 && <ResourceYamlCard resource={extension} />}
      </Content>
    </Page>
  );
};
