import React from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  Button,
  Collapse,
  makeStyles,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';

const useStyles = makeStyles(theme => ({
  root: {
    width: 240,
    minWidth: 240,
    padding: theme.spacing(2),
    borderRight: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    height: '100%',
    overflowY: 'auto',
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  },
  filterSection: {
    marginBottom: theme.spacing(2),
  },
  checkbox: {
    padding: theme.spacing(0.5),
  },
  checkboxLabel: {
    fontSize: '0.875rem',
  },
  clearButton: {
    marginTop: theme.spacing(2),
  },
  count: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginLeft: theme.spacing(1),
  },
}));

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterSection {
  id: string;
  title: string;
  options: FilterOption[];
  collapsed?: boolean;
}

export interface FilterState {
  [sectionId: string]: string[];
}

interface FilterPanelProps {
  sections: FilterSection[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClear?: () => void;
}

export const FilterPanel = ({
  sections,
  filters,
  onChange,
  onClear,
}: FilterPanelProps) => {
  const classes = useStyles();
  const [collapsedSections, setCollapsedSections] = React.useState<Set<string>>(
    new Set(sections.filter(s => s.collapsed).map(s => s.id)),
  );

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleCheckboxChange = (sectionId: string, value: string) => {
    const currentValues = filters[sectionId] || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];

    onChange({
      ...filters,
      [sectionId]: newValues,
    });
  };

  const hasActiveFilters = Object.values(filters).some(
    values => values.length > 0,
  );

  const handleClear = () => {
    const clearedFilters: FilterState = {};
    sections.forEach(section => {
      clearedFilters[section.id] = [];
    });
    onChange(clearedFilters);
    onClear?.();
  };

  return (
    <Box className={classes.root}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="subtitle2">Filters</Typography>
        {hasActiveFilters && (
          <Button
            size="small"
            color="primary"
            onClick={handleClear}
          >
            Clear all
          </Button>
        )}
      </Box>

      <Divider />

      {sections.map(section => {
        const isCollapsed = collapsedSections.has(section.id);
        const selectedCount = (filters[section.id] || []).length;

        return (
          <Box key={section.id} className={classes.filterSection} mt={2}>
            <Box
              className={classes.sectionTitle}
              onClick={() => toggleSection(section.id)}
            >
              <Box display="flex" alignItems="center">
                <span>{section.title}</span>
                {selectedCount > 0 && (
                  <span className={classes.count}>({selectedCount})</span>
                )}
              </Box>
              {isCollapsed ? (
                <ExpandMoreIcon fontSize="small" />
              ) : (
                <ExpandLessIcon fontSize="small" />
              )}
            </Box>

            <Collapse in={!isCollapsed}>
              <FormGroup>
                {section.options.map(option => (
                  <FormControlLabel
                    key={option.value}
                    control={
                      <Checkbox
                        checked={(filters[section.id] || []).includes(option.value)}
                        onChange={() =>
                          handleCheckboxChange(section.id, option.value)
                        }
                        size="small"
                        className={classes.checkbox}
                        color="primary"
                      />
                    }
                    label={
                      <Box display="flex" alignItems="center">
                        <span className={classes.checkboxLabel}>
                          {option.label}
                        </span>
                        {option.count !== undefined && (
                          <span className={classes.count}>({option.count})</span>
                        )}
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
};
