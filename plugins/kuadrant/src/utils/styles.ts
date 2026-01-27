import { CSSProperties } from "react";

/**
 * Returns inline styles for API key status chips.
 * Uses inline styles to ensure proper specificity with Material-UI Chip.
 */
export const getStatusChipStyle = (phase: string): CSSProperties => {
  const base = { border: "none" };
  switch (phase) {
    case "Approved":
      return { ...base, backgroundColor: "#4caf50", color: "#fff" };
    case "Rejected":
      return { ...base, backgroundColor: "#f44336", color: "#fff" };
    default:
      return { ...base, backgroundColor: "#ff9800", color: "#fff" };
  }
};

/**
 * Returns inline styles for lifecycle chips.
 * Uses inline styles to ensure proper specificity with Material-UI Chip.
 */
export const getLifecycleChipStyle = (lifecycle: string): CSSProperties => {
  switch (lifecycle) {
    case "production":
      return { backgroundColor: "#1976d2", color: "#fff" }; // Blue
    case "experimental":
      return { backgroundColor: "#9c27b0", color: "#fff" }; // Purple
    case "deprecated":
      return { backgroundColor: "#ff9800", color: "#fff" }; // Orange
    default:
      return {};
  }
};
