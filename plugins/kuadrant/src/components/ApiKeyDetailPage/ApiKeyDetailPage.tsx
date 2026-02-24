import React, { useState } from "react";
import { useParams } from "react-router-dom";
import {
  useApi,
  alertApiRef,
} from "@backstage/core-plugin-api";
import { kuadrantApiRef } from '../../api';
import { useAsync } from "react-use";
import {
  Header,
  Page,
  Content,
  ResponseErrorPanel,
  InfoCard,
  Link,
  Breadcrumbs,
} from "@backstage/core-components";
import {
  Box,
  Grid,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  makeStyles,
} from "@material-ui/core";
import { Skeleton } from "@material-ui/lab";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import WarningIcon from "@material-ui/icons/Warning";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import OpenInNewIcon from "@material-ui/icons/OpenInNew";
import EmailIcon from "@material-ui/icons/Email";
import { APIKey, APIProduct } from "../../types/api-management";
import { getApprovalQueueStatusChipStyle } from "../../utils/styles";

const useStyles = makeStyles((theme) => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
  },
  value: {
    marginBottom: theme.spacing(2),
  },
  codeBlock: {
    backgroundColor: theme.palette.background.default,
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    fontFamily: "monospace",
    fontSize: "0.875rem",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  apiKeyContainer: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
    fontFamily: "monospace",
  },
  tabPanel: {
    marginTop: theme.spacing(2),
  },
}));

const CodeExample = ({
  code,
  onCopy,
}: {
  code: string;
  onCopy: () => void;
}) => {
  const classes = useStyles();

  return (
    <Box position="relative">
      <Box className={classes.codeBlock}>{code}</Box>
      <Tooltip title="Copy code">
        <IconButton
          size="small"
          style={{ position: "absolute", top: 8, right: 8 }}
          onClick={onCopy}
        >
          <FileCopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export const ApiKeyDetailPage = () => {
  const classes = useStyles();
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const kuadrantApi = useApi(kuadrantApiRef);
  const alertApi = useApi(alertApiRef);

  const [selectedTab, setSelectedTab] = useState(0);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [alreadyRead, setAlreadyRead] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const {
    value: data,
    loading,
    error,
  } = useAsync(async () => {
    const [apiKeyData, productsData] = await Promise.all([
      kuadrantApi.getApiKey(namespace!, name!),
      kuadrantApi.getApiProducts(),
    ]);

    // check if key has already been read
    if (apiKeyData.status?.canReadSecret === false) {
      setAlreadyRead(true);
    }

    // find matching api product to get contact info
    const apiProduct = (productsData.items || []).find(
      (p: APIProduct) =>
        p.metadata.name === apiKeyData.spec.apiProductRef?.name &&
        p.metadata.namespace === apiKeyData.metadata.namespace,
    );

    return { apiKey: apiKeyData as APIKey, apiProduct };
  }, [namespace, name, kuadrantApi]);

  const apiKey = data?.apiKey;
  const apiProduct = data?.apiProduct;

  const fetchApiKeySecret = async () => {
    setApiKeyLoading(true);
    try {
      const extractedSecret = await kuadrantApi.getApiKeySecret(namespace!, name!);
      setApiKeyValue(extractedSecret.apiKey);
      setAlreadyRead(true);
      setShowApiKey(true);
    } catch (err) {
      console.error("Failed to fetch API key:", err);
      const errorMessage = err instanceof Error ? err.message : "unknown error occurred";
      if (errorMessage.includes("403") || errorMessage.includes("already been viewed")) {
        setAlreadyRead(true);
        alertApi.post({
          message:
            "This API key has already been viewed and cannot be retrieved again.",
          severity: "warning",
          display: "transient",
        });
      } else {
        alertApi.post({
          message: `Failed to fetch APIKey. ${errorMessage}`,
          severity: 'error',
          display: 'transient',
        });
      }
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleRevealClick = () => {
    if (showApiKey) {
      setShowApiKey(false);
      setApiKeyValue(null);
    } else if (!alreadyRead) {
      setShowWarning(true);
    }
  };

  const handleConfirmReveal = () => {
    setShowWarning(false);
    fetchApiKeySecret();
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alertApi.post({
      message: "Copied to clipboard",
      severity: "success",
      display: "transient",
    });
  };

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

  if (error || !apiKey) {
    return (
      <ResponseErrorPanel error={error || new Error("API key not found")} />
    );
  }

  const phase = apiKey.status?.phase || "Pending";
  const statusLabel = phase === "Approved" ? "Active" : phase;
  const hostname = apiKey.status?.apiHostname || "api.example.com";
  const displayApiKey = apiKeyValue || "<your-api-key>";

  // code examples
  const curlExample = `curl -H "Authorization: Bearer ${displayApiKey}" \\
  https://${hostname}/`;

  const nodeExample = `const response = await fetch('https://${hostname}/', {
  headers: {
    'Authorization': 'Bearer ${displayApiKey}'
  }
});
const data = await response.json();`;

  const pythonExample = `import requests

response = requests.get(
    'https://${hostname}/',
    headers={'Authorization': 'Bearer ${displayApiKey}'}
)
data = response.json()`;

  const goExample = `package main

import (
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "https://${hostname}/", nil)
    req.Header.Set("Authorization", "Bearer ${displayApiKey}")
    resp, _ := client.Do(req)
    defer resp.Body.Close()
}`;

  const codeExamples = [
    { label: "cURL", code: curlExample },
    { label: "Node.js", code: nodeExample },
    { label: "Python", code: pythonExample },
    { label: "Go", code: goExample },
  ];

  return (
    <Page themeId="tool">
      <Header
        title={apiKey.metadata.name}
        subtitle={`API Key for ${apiKey.spec.apiProductRef?.name || "unknown"}`}
      >
        <Link to="/kuadrant/my-api-keys">
          <Button startIcon={<ArrowBackIcon />}>Back to API Keys</Button>
        </Link>
      </Header>
      <Content>
        <Box mb={2}>
          <Breadcrumbs aria-label="breadcrumb">
            <Link to="/kuadrant/my-api-keys">API keys</Link>
            <Typography>{apiKey.metadata.name}</Typography>
          </Breadcrumbs>
        </Box>

        <Box mb={3} display="flex" style={{ gap: 8 }}>
          <Link to={`/catalog/default/api/${apiKey.spec.apiProductRef?.name}`}>
            <Button
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              data-testid="view-api-button"
            >
              View API
            </Button>
          </Link>
          {apiProduct?.spec?.contact &&
            (apiProduct.spec.contact.email ||
              apiProduct.spec.contact.url ||
              apiProduct.spec.contact.slack) && (
              <Button
                variant="outlined"
                startIcon={<EmailIcon />}
                href={
                  apiProduct.spec.contact.email
                    ? `mailto:${apiProduct.spec.contact.email}`
                    : apiProduct.spec.contact.slack
                      ? apiProduct.spec.contact.slack
                      : apiProduct.spec.contact.url || "#"
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Contact Owner
              </Button>
            )}
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <InfoCard title="API Key Details">
              <Box>
                <Typography variant="caption" className={classes.label}>
                  Status
                </Typography>
                <Box className={classes.value}>
                  <Chip
                    label={statusLabel}
                    size="small"
                    style={getApprovalQueueStatusChipStyle(phase)}
                    data-testid="api-key-status-chip"
                  />
                </Box>

                <Typography variant="caption" className={classes.label}>
                  API Product
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  <Link
                    to={`/catalog/default/api/${apiKey.spec.apiProductRef?.name}/api-keys`}
                  >
                    {apiKey.spec.apiProductRef?.name || "unknown"}
                  </Link>
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Tier
                </Typography>
                <Box className={classes.value}>
                  <Chip
                    label={apiKey.spec.planTier}
                    size="small"
                    variant="outlined"
                  />
                </Box>

                <Typography variant="caption" className={classes.label}>
                  Requester
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {apiKey.spec.requestedBy?.userId}
                </Typography>

                <Typography variant="caption" className={classes.label}>
                  Requested
                </Typography>
                <Typography variant="body1" className={classes.value}>
                  {apiKey.metadata.creationTimestamp
                    ? new Date(
                        apiKey.metadata.creationTimestamp,
                      ).toLocaleDateString()
                    : "-"}
                </Typography>

                {apiKey.status?.reviewedBy && (
                  <>
                    <Typography variant="caption" className={classes.label}>
                      Reviewed By
                    </Typography>
                    <Typography variant="body1" className={classes.value}>
                      {apiKey.status.reviewedBy.replace(/^user:default\//, "")}
                      {apiKey.status.reviewedAt && (
                        <Typography variant="caption" color="textSecondary">
                          {" "}
                          on{" "}
                          {new Date(
                            apiKey.status.reviewedAt,
                          ).toLocaleDateString()}
                        </Typography>
                      )}
                    </Typography>
                  </>
                )}
              </Box>
            </InfoCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <InfoCard title="Use Case">
              <Typography variant="body1">
                {apiKey.spec.useCase || "No use case provided"}
              </Typography>
            </InfoCard>

            {phase === "Approved" && (
              <Box mt={2}>
                <InfoCard title="API Key">
                  {alreadyRead && !apiKeyValue ? (
                    <Tooltip title="This API key has already been viewed and cannot be retrieved again">
                      <Box display="flex" alignItems="center">
                        <Typography variant="body2" color="textSecondary">
                          Already viewed - cannot be retrieved again
                        </Typography>
                        <VisibilityOffIcon
                          fontSize="small"
                          color="disabled"
                          style={{ marginLeft: 8 }}
                        />
                      </Box>
                    </Tooltip>
                  ) : (
                    <Box className={classes.apiKeyContainer}>
                      <Typography
                        variant="body2"
                        style={{ fontFamily: "monospace", flex: 1 }}
                      >
                        {apiKeyLoading
                          ? "Loading..."
                          : showApiKey && apiKeyValue
                            ? apiKeyValue
                            : "•".repeat(32)}
                      </Typography>
                      {showApiKey && apiKeyValue && (
                        <Tooltip title="Copy to clipboard">
                          <IconButton
                            size="small"
                            onClick={() => handleCopy(apiKeyValue)}
                          >
                            <FileCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip
                        title={
                          showApiKey
                            ? "Hide API key"
                            : "Reveal API key (one-time only)"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            onClick={handleRevealClick}
                            disabled={
                              apiKeyLoading || (alreadyRead && !apiKeyValue)
                            }
                          >
                            {showApiKey ? (
                              <VisibilityOffIcon fontSize="small" />
                            ) : (
                              <VisibilityIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  )}
                </InfoCard>
              </Box>
            )}
          </Grid>

          {phase === "Approved" && (
            <Grid item xs={12}>
              <InfoCard title="Code Examples">
                <Box>
                  <Tabs
                    value={selectedTab}
                    onChange={(_, newValue) => setSelectedTab(newValue)}
                    indicatorColor="primary"
                    textColor="primary"
                  >
                    {codeExamples.map((ex) => (
                      <Tab key={ex.label} label={ex.label} />
                    ))}
                  </Tabs>
                  <Box className={classes.tabPanel}>
                    <CodeExample
                      code={codeExamples[selectedTab].code}
                      onCopy={() => handleCopy(codeExamples[selectedTab].code)}
                    />
                  </Box>
                </Box>
              </InfoCard>
            </Grid>
          )}

          {apiKey.status?.limits && (
            <Grid item xs={12}>
              <InfoCard title="Rate Limits">
                <Grid container spacing={2}>
                  {apiKey.status.limits.daily && (
                    <Grid item>
                      <Typography variant="caption" className={classes.label}>
                        Daily
                      </Typography>
                      <Typography variant="h6">
                        {apiKey.status.limits.daily.toLocaleString()}
                      </Typography>
                    </Grid>
                  )}
                  {apiKey.status.limits.weekly && (
                    <Grid item>
                      <Typography variant="caption" className={classes.label}>
                        Weekly
                      </Typography>
                      <Typography variant="h6">
                        {apiKey.status.limits.weekly.toLocaleString()}
                      </Typography>
                    </Grid>
                  )}
                  {apiKey.status.limits.monthly && (
                    <Grid item>
                      <Typography variant="caption" className={classes.label}>
                        Monthly
                      </Typography>
                      <Typography variant="h6">
                        {apiKey.status.limits.monthly.toLocaleString()}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </InfoCard>
            </Grid>
          )}
        </Grid>
      </Content>

      <Dialog
        open={showWarning}
        onClose={() => setShowWarning(false)}
        maxWidth="sm"
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <WarningIcon color="primary" style={{ marginRight: 8 }} />
            View API Key
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            This API key can only be viewed <strong>once</strong>. After you
            reveal it, you will not be able to retrieve it again.
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Make sure to copy and store it securely before closing this view.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowWarning(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmReveal}
          >
            Reveal API Key
          </Button>
        </DialogActions>
      </Dialog>
    </Page>
  );
};
