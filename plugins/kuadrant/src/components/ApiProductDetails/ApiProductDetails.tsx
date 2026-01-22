import React from "react";
import {
  Box,
  Typography,
  Chip,
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Grid,
} from "@material-ui/core";
import { Link } from "@backstage/core-components";
import { APIProduct, Plan } from "../../types/api-management";

const useStyles = makeStyles((theme) => ({
  label: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
    fontSize: "0.75rem",
    textTransform: "uppercase",
  },
  tierChip: {
    marginRight: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  statusChipPublished: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  statusChipDraft: {
    backgroundColor: theme.palette.grey[600],
    color: theme.palette.common.white,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  infoItem: {
    minWidth: 0,
  },
  apiLink: {
    color: theme.palette.primary.main,
    textDecoration: "none",
    "&:hover": {
      textDecoration: "underline",
    },
  },
}));

interface ApiProductDetailsProps {
  product: APIProduct;
  showStatus?: boolean;
  showCatalogLink?: boolean;
}

export const ApiProductDetails = ({
  product,
  showStatus = true,
  showCatalogLink = true,
}: ApiProductDetailsProps) => {
  const classes = useStyles();

  const publishStatus = product.spec?.publishStatus || "Draft";
  const isPublished = publishStatus === "Published";
  const tiers = product.status?.discoveredPlans || [];

  // check if product has API key auth
  const authSchemes = product.status?.discoveredAuthScheme?.authentication || {};
  const schemeObjects = Object.values(authSchemes);
  const hasApiKey = schemeObjects.some(
    (scheme: any) => scheme.hasOwnProperty("apiKey"),
  );

  return (
    <>
      {product.spec?.description && (
        <Box mb={3}>
          <Typography variant="caption" className={classes.label}>
            Description
          </Typography>
          <Typography variant="body1">{product.spec.description}</Typography>
        </Box>
      )}

      <Box className={classes.infoGrid}>
        {showStatus && (
          <Box className={classes.infoItem}>
            <Typography variant="caption" className={classes.label}>
              Status
            </Typography>
            <Box>
              <Chip
                label={publishStatus}
                size="small"
                className={
                  isPublished
                    ? classes.statusChipPublished
                    : classes.statusChipDraft
                }
                data-testid="publish-status-chip"
              />
            </Box>
          </Box>
        )}
        <Box className={classes.infoItem}>
          <Typography variant="caption" className={classes.label}>
            Version
          </Typography>
          <Typography variant="body2">
            {product.spec?.version || "v1"}
          </Typography>
        </Box>
        <Box className={classes.infoItem}>
          <Typography variant="caption" className={classes.label}>
            Namespace
          </Typography>
          <Typography variant="body2">{product.metadata.namespace}</Typography>
        </Box>
        {hasApiKey && (
          <Box className={classes.infoItem}>
            <Typography variant="caption" className={classes.label}>
              API Key Approval
            </Typography>
            <Typography variant="body2">
              {product.spec?.approvalMode === "automatic"
                ? "Automatic"
                : "Need manual approval"}
            </Typography>
          </Box>
        )}
        {product.spec?.tags && product.spec.tags.length > 0 && (
          <Box className={classes.infoItem}>
            <Typography variant="caption" className={classes.label}>
              Tags
            </Typography>
            <Box>
              {product.spec.tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  className={classes.tierChip}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Box className={classes.infoGrid}>
        <Box className={classes.infoItem}>
          <Typography variant="caption" className={classes.label}>
            API
          </Typography>
          <br />
          {showCatalogLink ? (
            <Link
              to={`/catalog/default/api/${product.metadata.name}`}
              className={classes.apiLink}
            >
              {product.metadata.name}
            </Link>
          ) : (
            <Typography variant="body2">{product.metadata.name}</Typography>
          )}
        </Box>
        <Box className={classes.infoItem}>
          <Typography variant="caption" className={classes.label}>
            Route
          </Typography>
          <Typography variant="body2">
            {product.spec?.targetRef?.name || "-"}
          </Typography>
        </Box>
      </Box>

      {tiers.length > 0 && (
        <Box mb={3}>
          <Typography variant="caption" className={classes.label}>
            Available Tiers
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tier</TableCell>
                <TableCell>Rate Limits</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiers.map((plan: Plan) => (
                <TableRow key={plan.tier}>
                  <TableCell>
                    <Chip label={plan.tier} size="small" />
                  </TableCell>
                  <TableCell>
                    {plan.limits &&
                      Object.entries(plan.limits).map(([key, value]) => (
                        <Typography key={key} variant="body2">
                          {String(value)} per {key}
                        </Typography>
                      ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Grid container spacing={3}>
        {(product.spec?.contact?.email || product.spec?.contact?.team) && (
          <Grid item xs={12} md={6}>
            <Typography variant="caption" className={classes.label}>
              Contact Information
            </Typography>
            <Box mt={1}>
              {product.spec.contact.team && (
                <Typography variant="body2">
                  <strong>Team:</strong> {product.spec.contact.team}
                </Typography>
              )}
              {product.spec.contact.email && (
                <Typography variant="body2">
                  <strong>Email:</strong>{" "}
                  <Link to={`mailto:${product.spec.contact.email}`}>
                    {product.spec.contact.email}
                  </Link>
                </Typography>
              )}
            </Box>
          </Grid>
        )}

        {(product.spec?.documentation?.docsURL ||
          product.spec?.documentation?.openAPISpecURL) && (
          <Grid item xs={12} md={6}>
            <Typography variant="caption" className={classes.label}>
              Documentation
            </Typography>
            <Box mt={1}>
              {product.spec.documentation.docsURL && (
                <Typography variant="body2">
                  <strong>Docs:</strong>{" "}
                  <Link to={product.spec.documentation.docsURL} target="_blank">
                    View Documentation
                  </Link>
                </Typography>
              )}
              {product.spec.documentation.openAPISpecURL && (
                <Typography variant="body2">
                  <strong>OpenAPI Spec:</strong>{" "}
                  <Link
                    to={product.spec.documentation.openAPISpecURL}
                    target="_blank"
                  >
                    View Spec
                  </Link>
                </Typography>
              )}
            </Box>
          </Grid>
        )}
      </Grid>
    </>
  );
};
