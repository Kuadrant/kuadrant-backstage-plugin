import React, { ReactNode, useMemo, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  Divider,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  makeStyles,
} from "@material-ui/core";
import { Skeleton } from "@material-ui/lab";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import WarningIcon from "@material-ui/icons/Warning";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import ListAltIcon from "@material-ui/icons/ListAlt";
import MoreVertIcon from "@material-ui/icons/MoreVert";
import OpenInNewIcon from "@material-ui/icons/OpenInNew";
import FilterListIcon from "@material-ui/icons/FilterList";
import SearchIcon from "@material-ui/icons/Search";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import SchoolIcon from "@material-ui/icons/School";
import WidgetsIcon from "@material-ui/icons/Widgets";
import InsightsIcon from "@material-ui/icons/TrendingUp";
import {
  Page,
  Header,
  Content,
  InfoCard,
  SupportButton,
  ResponseErrorPanel,
  Table,
  TableColumn,
} from "@backstage/core-components";
import useAsync from "react-use/lib/useAsync";
import { useApi } from "@backstage/core-plugin-api";
import { kuadrantApiRef } from "../../api";
import { useKuadrantPermission } from "../../utils/permissions";
import {
  kuadrantGatewayListPermission,
  kuadrantMcpGatewayExtensionListPermission,
  kuadrantMcpServerRegistrationListPermission,
} from "../../permissions";
import {
  GatewayResource,
  MCPGatewayExtension,
  MCPServerRegistration,
} from "../../types/mcp";
import {
  countHealthyGateways,
  countOnlineServers,
  countServerTypes,
  deriveMcpGateways,
  isGatewayHealthy,
  isServerOnline,
} from "./utils";

const DOCS_LINKS = {
  documentation: "https://docs.kuadrant.io/latest/",
  useCases: "https://docs.kuadrant.io/latest/kuadrant-operator/",
  gatewayApiServiceMesh: "https://gateway-api.sigs.k8s.io/",
  observability:
    "https://docs.kuadrant.io/latest/kuadrant-operator/doc/observability/",
};

const GETTING_STARTED_STORAGE_KEY = "hideMCPGettingStarted";

const useStyles = makeStyles((theme) => ({
  divider: {
    margin: theme.spacing(2, 0, 3),
  },
  statValue: {
    fontSize: "1.6rem",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
  },
  statLabel: {
    color: theme.palette.text.secondary,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
  },
  statGroupTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(3),
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(0.5),
  },
  healthy: {
    color: theme.palette.success.main,
  },
  unhealthy: {
    color: theme.palette.warning.main,
  },
  gsColumnTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 20,
    padding: theme.spacing(0.5, 1.5),
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
  },
  gsDescription: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    minHeight: 48,
  },
  externalLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  nsBadge: {
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.palette.success.main,
    color: theme.palette.common.white,
    fontSize: "0.7rem",
    fontWeight: 700,
    marginRight: theme.spacing(0.5),
    padding: theme.spacing(0, 0.75),
    display: "inline-flex",
    alignItems: "center",
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
  },
  filterCriterion: {
    minWidth: 160,
  },
  filterSearch: {
    minWidth: 240,
  },
  filterIcon: {
    color: theme.palette.text.secondary,
    marginRight: theme.spacing(0.5),
  },
}));

/** small green "NS" badge followed by the namespace name */
const NamespaceCell = ({ namespace }: { namespace?: string }) => {
  const classes = useStyles();
  if (!namespace) return <>-</>;
  return (
    <Box display="flex" alignItems="center">
      <span className={classes.nsBadge}>NS</span>
      <span>{namespace}</span>
    </Box>
  );
};

/** outlined pill with a check (ok) or warning (not ok) icon */
const StatusPill = ({ ok, label }: { ok: boolean; label: string }) => (
  <Chip
    variant="outlined"
    size="small"
    icon={
      ok ? (
        <CheckCircleIcon style={{ color: "var(--rh-green, #3e8635)" }} />
      ) : (
        <WarningIcon color="error" />
      )
    }
    label={label}
  />
);

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => {
  const classes = useStyles();
  return (
    <div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes.externalLink}
      >
        {children}
        <OpenInNewIcon fontSize="inherit" />
      </a>
    </div>
  );
};

const GettingStartedCard = ({ onHide }: { onHide: () => void }) => {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(true);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  return (
    <InfoCard
      title={
        <Box display="flex" alignItems="center">
          <IconButton
            size="small"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
          </IconButton>
          <Typography variant="h6">Get started with MCP management</Typography>
        </Box>
      }
      action={
        <>
          <IconButton
            aria-label="Getting started actions"
            data-testid="mcp-getting-started-menu"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                onHide();
              }}
            >
              Don't show again
            </MenuItem>
          </Menu>
        </>
      }
    >
      <Collapse in={expanded}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={4}>
            <span className={classes.gsColumnTitle}>
              <SchoolIcon fontSize="small" /> Learning resources
            </span>
            <Typography className={classes.gsDescription}>
              Learn how to create, import, and use MCP gateways and servers.
            </Typography>
            <ExternalLink href={DOCS_LINKS.documentation}>
              View documentation
            </ExternalLink>
            <ExternalLink href={DOCS_LINKS.useCases}>
              View use cases
            </ExternalLink>
          </Grid>
          <Grid item xs={12} md={4}>
            <span className={classes.gsColumnTitle}>
              <WidgetsIcon fontSize="small" /> Feature highlights
            </span>
            <Typography className={classes.gsDescription}>
              Explore how to connect MCP servers and offer a single endpoint for
              your teams.
            </Typography>
            <ExternalLink href={DOCS_LINKS.gatewayApiServiceMesh}>
              Gateway API for service mesh
            </ExternalLink>
          </Grid>
          <Grid item xs={12} md={4}>
            <span className={classes.gsColumnTitle}>
              <InsightsIcon fontSize="small" /> Enhance your work
            </span>
            <Typography className={classes.gsDescription}>
              Leverage powerful observability to monitor traffic flows,
              streamline resource management for consistent operations.
            </Typography>
            <ExternalLink href={DOCS_LINKS.observability}>
              Observability for Gateway API
            </ExternalLink>
          </Grid>
        </Grid>
      </Collapse>
    </InfoCard>
  );
};

const Stat = ({
  value,
  label,
  icon,
  tooltip,
  colorClass,
}: {
  value: number;
  label: string;
  icon?: ReactNode;
  tooltip?: string;
  colorClass?: string;
}) => {
  const classes = useStyles();
  const labelNode = (
    <span className={classes.statLabel}>
      {label}
      {tooltip && <HelpOutlineIcon fontSize="inherit" />}
    </span>
  );
  return (
    <Box textAlign="center" px={2}>
      <div
        className={`${classes.statValue} ${colorClass ?? ""}`}
        style={{ justifyContent: "center" }}
      >
        {icon}
        {value}
      </div>
      {tooltip ? <Tooltip title={tooltip}>{labelNode}</Tooltip> : labelNode}
    </Box>
  );
};

const AccessDenied = ({
  title,
  resource,
}: {
  title: string;
  resource: string;
}) => (
  <InfoCard title={title}>
    <Box p={2} textAlign="center">
      <Typography color="textSecondary">
        You do not have permission to view {resource}.
      </Typography>
    </Box>
  </InfoCard>
);

/** a single filterable attribute: which column, its label, and how to read it */
type FilterCriterion<T> = {
  key: string;
  label: string;
  accessor: (row: T) => string;
  // exact criteria match the whole value rather than a substring. needed for
  // enum-like columns whose values overlap (e.g. "Healthy" is a substring of
  // "Unhealthy", so a substring match on "Healthy" would also return unhealthy)
  exact?: boolean;
};

/**
 * filter rows against the selected criterion: exact criteria compare the whole
 * value case-insensitively, others do a case-insensitive substring match.
 */
function applyFilter<T>(
  rows: T[],
  criteria: FilterCriterion<T>[],
  criterionKey: string,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const active = criteria.find((c) => c.key === criterionKey) ?? criteria[0];
  return rows.filter((row) => {
    const value = active.accessor(row).toLowerCase();
    return active.exact ? value === q : value.includes(q);
  });
}

/**
 * console-style filter toolbar: a criterion dropdown (which attribute to filter
 * by) paired with a search box that filters rows by the selected criterion.
 */
function FilterToolbar<T>({
  criteria,
  criterionKey,
  onCriterionChange,
  query,
  onQueryChange,
}: {
  criteria: FilterCriterion<T>[];
  criterionKey: string;
  onCriterionChange: (key: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const classes = useStyles();
  const active = criteria.find((c) => c.key === criterionKey) ?? criteria[0];
  return (
    <div className={classes.filterRow}>
      <TextField
        select
        size="small"
        variant="outlined"
        value={active.key}
        onChange={(e) => onCriterionChange(String(e.target.value))}
        className={classes.filterCriterion}
        InputProps={{
          startAdornment: (
            <FilterListIcon fontSize="small" className={classes.filterIcon} />
          ),
        }}
        inputProps={{ "aria-label": "Filter criterion" }}
      >
        {criteria.map((c) => (
          <MenuItem key={c.key} value={c.key}>
            {c.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        variant="outlined"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={`Search by ${active.label.toLowerCase()}...`}
        className={classes.filterSearch}
        InputProps={{
          startAdornment: (
            <SearchIcon fontSize="small" className={classes.filterIcon} />
          ),
        }}
        inputProps={{ "aria-label": "Search" }}
      />
    </div>
  );
}

const GATEWAY_CRITERIA: FilterCriterion<GatewayResource>[] = [
  { key: "name", label: "Name", accessor: (r) => r.metadata?.name ?? "" },
  {
    key: "namespace",
    label: "Namespace",
    accessor: (r) => r.metadata?.namespace ?? "",
  },
  {
    key: "status",
    label: "Status",
    accessor: (r) => (isGatewayHealthy(r) ? "Healthy" : "Unhealthy"),
    exact: true,
  },
  {
    key: "gatewayClass",
    label: "Gateway Class",
    accessor: (r) => r.spec?.gatewayClassName ?? "",
  },
];

const EXTENSION_CRITERIA: FilterCriterion<MCPGatewayExtension>[] = [
  { key: "name", label: "Name", accessor: (r) => r.metadata?.name ?? "" },
  {
    key: "gateway",
    label: "Gateway name",
    accessor: (r) => r.spec?.targetRef?.name ?? "",
  },
  {
    key: "namespace",
    label: "Namespace",
    accessor: (r) => r.metadata?.namespace ?? "",
  },
];

const SERVER_CRITERIA: FilterCriterion<MCPServerRegistration>[] = [
  { key: "name", label: "Name", accessor: (r) => r.metadata?.name ?? "" },
  {
    key: "namespace",
    label: "Namespace",
    accessor: (r) => r.metadata?.namespace ?? "",
  },
  {
    key: "status",
    label: "Status",
    accessor: (r) => (isServerOnline(r) ? "Online" : "Offline"),
    exact: true,
  },
];

/**
 * a permission-gated resource card: title, a console-style filter toolbar, and
 * a paginated read-only table. Owns its own filter state; renders AccessDenied
 * when the viewer lacks the list permission.
 */
function ResourceTableCard<T extends object>({
  allowed,
  title,
  resource,
  criteria,
  columns,
  data,
  emptyText,
}: {
  allowed: boolean;
  title: string;
  resource: string;
  criteria: FilterCriterion<T>[];
  columns: TableColumn<T>[];
  data: T[];
  emptyText: string;
}) {
  const [criterionKey, setCriterionKey] = useState(criteria[0]?.key ?? "name");
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => applyFilter(data, criteria, criterionKey, query),
    [data, criteria, criterionKey, query],
  );

  if (!allowed) {
    return <AccessDenied title={title} resource={resource} />;
  }

  return (
    <InfoCard title={title}>
      <FilterToolbar<T>
        criteria={criteria}
        criterionKey={criterionKey}
        onCriterionChange={(key) => {
          // reset the search box so stale text doesn't filter against the new
          // criterion (e.g. a namespace query left over after switching to Status)
          setCriterionKey(key);
          setQuery("");
        }}
        query={query}
        onQueryChange={setQuery}
      />
      <Table<T>
        options={{
          paging: filtered.length > 10,
          pageSize: 10,
          search: false,
          toolbar: false,
          emptyRowsWhenPaging: false,
        }}
        columns={columns}
        data={filtered}
        emptyContent={
          <Box p={2} textAlign="center">
            <Typography color="textSecondary">{emptyText}</Typography>
          </Box>
        }
      />
    </InfoCard>
  );
}

const McpContent = () => {
  const classes = useStyles();
  const kuadrantApi = useApi(kuadrantApiRef);

  const [hideGettingStarted, setHideGettingStarted] = useState(
    typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(GETTING_STARTED_STORAGE_KEY) === "true",
  );
  const { allowed: canListExtensions, loading: extPermLoading } =
    useKuadrantPermission(kuadrantMcpGatewayExtensionListPermission);
  const { allowed: canListServers, loading: srvPermLoading } =
    useKuadrantPermission(kuadrantMcpServerRegistrationListPermission);
  const { allowed: canListGateways, loading: gwPermLoading } =
    useKuadrantPermission(kuadrantGatewayListPermission);

  const permsLoading = extPermLoading || srvPermLoading || gwPermLoading;

  const {
    value: extensions,
    loading: extLoading,
    error: extError,
  } = useAsync(async () => {
    if (!canListExtensions) return { items: [] as MCPGatewayExtension[] };
    return kuadrantApi.getMcpGatewayExtensions();
  }, [kuadrantApi, canListExtensions]);

  const {
    value: servers,
    loading: srvLoading,
    error: srvError,
  } = useAsync(async () => {
    if (!canListServers) return { items: [] as MCPServerRegistration[] };
    return kuadrantApi.getMcpServerRegistrations();
  }, [kuadrantApi, canListServers]);

  const {
    value: gateways,
    loading: gwLoading,
    error: gwError,
  } = useAsync(async () => {
    if (!canListGateways) return { items: [] };
    return kuadrantApi.getGateways();
  }, [kuadrantApi, canListGateways]);

  const extensionItems = useMemo(() => extensions?.items ?? [], [extensions]);
  const serverItems = useMemo(() => servers?.items ?? [], [servers]);

  const mcpGateways = useMemo(
    () => deriveMcpGateways(extensionItems, gateways?.items),
    [extensionItems, gateways],
  );
  const healthyGateways = useMemo(
    () => countHealthyGateways(mcpGateways),
    [mcpGateways],
  );
  const onlineServers = useMemo(
    () => countOnlineServers(serverItems),
    [serverItems],
  );
  const serverTypes = useMemo(
    () => countServerTypes(serverItems),
    [serverItems],
  );

  const loading = permsLoading || extLoading || srvLoading || gwLoading;
  const error = extError || srvError || gwError;

  const gatewayColumns: TableColumn<GatewayResource>[] = [
    {
      title: "Name",
      field: "metadata.name",
      render: (row) => <strong>{row.metadata?.name}</strong>,
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => <NamespaceCell namespace={row.metadata?.namespace} />,
    },
    {
      title: "Status",
      field: "status",
      // field resolves to the raw status object, so sort on the derived health
      customSort: (a, b) =>
        Number(isGatewayHealthy(a)) - Number(isGatewayHealthy(b)),
      render: (row) => {
        const healthy = isGatewayHealthy(row);
        return (
          <StatusPill ok={healthy} label={healthy ? "Healthy" : "Unhealthy"} />
        );
      },
    },
    {
      title: "Gateway Class",
      field: "spec.gatewayClassName",
      render: (row) => row.spec?.gatewayClassName || "-",
    },
  ];

  const extensionColumns: TableColumn<MCPGatewayExtension>[] = [
    {
      title: "Extension name",
      field: "metadata.name",
      render: (row) => <strong>{row.metadata?.name}</strong>,
    },
    {
      title: "Gateway name",
      field: "spec.targetRef.name",
      render: (row) => row.spec?.targetRef?.name || "-",
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => <NamespaceCell namespace={row.metadata?.namespace} />,
    },
  ];

  const serverColumns: TableColumn<MCPServerRegistration>[] = [
    {
      title: "Server name",
      field: "metadata.name",
      render: (row) => <strong>{row.metadata?.name}</strong>,
    },
    {
      title: "Namespace",
      field: "metadata.namespace",
      render: (row) => <NamespaceCell namespace={row.metadata?.namespace} />,
    },
    {
      title: "Status",
      field: "status",
      // field resolves to the raw status object, so sort on the derived state
      customSort: (a, b) =>
        Number(isServerOnline(a)) - Number(isServerOnline(b)),
      render: (row) => {
        const online = isServerOnline(row);
        return <StatusPill ok={online} label={online ? "Online" : "Offline"} />;
      },
    },
  ];

  if (loading) {
    return (
      <Box p={2}>
        {[...Array(5)].map((_, i) => (
          <Box key={i} p={2}>
            <Skeleton variant="text" width="100%" />
          </Box>
        ))}
      </Box>
    );
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return (
    <>
      <Divider className={classes.divider} />

      {!hideGettingStarted && (
        <Box mb={3}>
          <GettingStartedCard
            onHide={() => {
              sessionStorage.setItem(GETTING_STARTED_STORAGE_KEY, "true");
              setHideGettingStarted(true);
            }}
          />
        </Box>
      )}

      {/* summary strip */}
      <Box mb={3}>
        <InfoCard>
          <Grid container>
            <Grid item xs={12} md={6}>
              <Typography className={classes.statGroupTitle}>
                Gateways
                <Tooltip title="MCP gateways are Gateways targeted by an MCPGatewayExtension.">
                  <HelpOutlineIcon fontSize="inherit" />
                </Tooltip>
              </Typography>
              <Box display="flex" justifyContent="space-around">
                <Stat value={mcpGateways.length} label="Total" />
                <Stat
                  value={healthyGateways}
                  label="Healthy"
                  colorClass={classes.healthy}
                  icon={<CheckCircleIcon className={classes.healthy} />}
                  tooltip="A healthy gateway has a 'True' status for the Accepted and Programmed conditions."
                />
                <Stat
                  value={mcpGateways.length - healthyGateways}
                  label="Unhealthy"
                  colorClass={classes.unhealthy}
                  icon={<WarningIcon className={classes.unhealthy} />}
                  tooltip="An unhealthy gateway has a 'False' status for the Accepted and/or Programmed conditions."
                />
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography className={classes.statGroupTitle}>
                Servers
              </Typography>
              <Box display="flex" justifyContent="space-around">
                <Stat
                  value={serverTypes}
                  label="Types"
                  icon={<ListAltIcon />}
                />
                <Stat value={serverItems.length} label="Total" />
                <Stat
                  value={onlineServers}
                  label="Online"
                  colorClass={classes.healthy}
                  icon={<CheckCircleIcon className={classes.healthy} />}
                  tooltip="An online server has a 'True' status for the Ready condition."
                />
                <Stat
                  value={serverItems.length - onlineServers}
                  label="Offline"
                  colorClass={classes.unhealthy}
                  icon={<WarningIcon className={classes.unhealthy} />}
                  tooltip="An offline server does not have a 'True' status for the Ready condition."
                />
              </Box>
            </Grid>
          </Grid>
        </InfoCard>
      </Box>

      {/* mcp gateways table */}
      <Box mb={3}>
        <ResourceTableCard<GatewayResource>
          allowed={canListGateways}
          title="MCP Gateways"
          resource="MCP Gateways"
          criteria={GATEWAY_CRITERIA}
          columns={gatewayColumns}
          data={mcpGateways}
          emptyText="No MCP gateways found."
        />
      </Box>

      {/* mcp gateway extensions table */}
      <Box mb={3}>
        <ResourceTableCard<MCPGatewayExtension>
          allowed={canListExtensions}
          title="MCP Gateway Extensions"
          resource="MCP Gateway Extensions"
          criteria={EXTENSION_CRITERIA}
          columns={extensionColumns}
          data={extensionItems}
          emptyText="No MCP gateway extensions found."
        />
      </Box>

      {/* mcp servers table */}
      <Box mb={3}>
        <ResourceTableCard<MCPServerRegistration>
          allowed={canListServers}
          title="MCP Servers"
          resource="MCP Servers"
          criteria={SERVER_CRITERIA}
          columns={serverColumns}
          data={serverItems}
          emptyText="No MCP servers found."
        />
      </Box>
    </>
  );
};

export const McpOverviewPage = () => (
  <Page themeId="tool">
    <Header
      title="MCP management"
      subtitle="Manage your MCP gateways and servers"
    >
      <SupportButton>
        View and manage MCP gateways, extensions, and servers.
      </SupportButton>
    </Header>
    <Content>
      <McpContent />
    </Content>
  </Page>
);
