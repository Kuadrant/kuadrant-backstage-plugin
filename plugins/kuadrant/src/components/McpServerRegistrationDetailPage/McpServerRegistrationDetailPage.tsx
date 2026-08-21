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
import { MCPServerRegistration, McpCondition } from "../../types/mcp";
import { ResourceYamlCard } from "../ResourceYamlCard";
import { formatAge, formatOwner, isServerOnline } from "./utils";
import { useKuadrantPermission } from "../../utils/permissions";
import { kuadrantMcpServerRegistrationListPermission } from "../../permissions";

const useStyles = makeStyles((theme) => ({
  tabs: {
    // MUI's default Tab padding (24px at the sm breakpoint and up) otherwise
    // indents "Details"/"YAML" relative to the breadcrumb and card heading
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
  annotationText: {
    fontFamily: "monospace",
    fontSize: "0.75rem",
  },
}));

export const McpServerRegistrationDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<"namespace" | "name">();
  const kuadrantApi = useApi(kuadrantApiRef);

  const [selectedTab, setSelectedTab] = useState(0);

  const {
    allowed: canView,
    loading: permissionLoading,
    error: permissionError,
  } = useKuadrantPermission(kuadrantMcpServerRegistrationListPermission);

  const {
    value: server,
    loading,
    error,
  } = useAsync(async () => {
    if (!canView) {
      return undefined;
    }
    return (await kuadrantApi.getMcpServerRegistration(
      namespace!,
      name!,
    )) as MCPServerRegistration;
  }, [namespace, name, kuadrantApi, canView]);

  if (permissionLoading || loading) {
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

  if (permissionError) {
    return <ResponseErrorPanel error={permissionError} />;
  }

  if (!canView) {
    return (
      <ResponseErrorPanel
        error={
          new Error(
            "You do not have permission to view this MCP Server Registration",
          )
        }
      />
    );
  }

  if (error || !server) {
    return (
      <ResponseErrorPanel
        error={error || new Error("MCP Server Registration not found")}
      />
    );
  }

  const conditions = server.status?.conditions || [];
  const online = isServerOnline(server);
  const labels = server.metadata?.labels || {};
  const annotations = server.metadata?.annotations || {};
  const createdAt = server.metadata?.creationTimestamp;
  const owner = formatOwner(server);

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
          className={
            row.status === "True" ? classes.statusChipReady : undefined
          }
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
        title={server.metadata?.name || "MCP Server Registration"}
        subtitle={`Namespace: ${server.metadata?.namespace || "-"}`}
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
              {server.metadata?.name || "Server Registration"}
            </Typography>
          </Breadcrumbs>
        </Box>

        <Box mb={2}>
          <Tabs
            className={classes.tabs}
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
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
                    {server.metadata?.name || "-"}
                  </Typography>
                </Box>

                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Namespace
                  </Typography>
                  <Typography variant="body2">
                    {server.metadata?.namespace || "-"}
                  </Typography>
                </Box>

                <Box className={classes.infoItem}>
                  <Typography variant="caption" className={classes.label}>
                    Status
                  </Typography>
                  <Box>
                    <Chip
                      label={online ? "Online" : "Offline"}
                      size="small"
                      className={
                        online
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

                {server.metadata?.ownerReferences &&
                  server.metadata.ownerReferences.length > 0 && (
                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Owner
                      </Typography>
                      <Typography variant="body2">{owner}</Typography>
                    </Box>
                  )}

                {server.spec?.prefix && (
                  <Box className={classes.infoItem}>
                    <Typography variant="caption" className={classes.label}>
                      Prefix
                    </Typography>
                    <Typography variant="body2">
                      {server.spec.prefix}
                    </Typography>
                  </Box>
                )}

                {server.spec?.targetRef && (
                  <>
                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Target Name
                      </Typography>
                      <Typography variant="body2">
                        {server.spec.targetRef.name || "-"}
                      </Typography>
                    </Box>

                    <Box className={classes.infoItem}>
                      <Typography variant="caption" className={classes.label}>
                        Target Kind
                      </Typography>
                      <Typography variant="body2">
                        {server.spec.targetRef.kind || "-"}
                      </Typography>
                    </Box>

                    {server.spec.targetRef.group && (
                      <Box className={classes.infoItem}>
                        <Typography variant="caption" className={classes.label}>
                          Target Group
                        </Typography>
                        <Typography variant="body2">
                          {server.spec.targetRef.group}
                        </Typography>
                      </Box>
                    )}
                  </>
                )}
              </Box>

              {server.spec?.category && server.spec.category.length > 0 && (
                <Box mb={3}>
                  <Typography variant="caption" className={classes.label}>
                    Categories
                  </Typography>
                  <Grid container spacing={1}>
                    {server.spec.category.map((cat) => (
                      <Grid item key={cat}>
                        <Chip label={cat} size="small" variant="outlined" />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}

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
                          className={classes.annotationText}
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

        {selectedTab === 1 && <ResourceYamlCard resource={server} />}
      </Content>
    </Page>
  );
};
