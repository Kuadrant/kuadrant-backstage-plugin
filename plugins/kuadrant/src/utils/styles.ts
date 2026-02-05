import { CSSProperties } from "react";

/**
 * Returns inline styles for API key status chips on the My API Keys page.
 */
export const getMyApiKeysStatusChipStyle = (phase: string): CSSProperties => {
  const base = { border: "none" };
  switch (phase) {
    case "Approved":
      return { ...base, backgroundColor: "#1976d2", color: "#fff" }; // Blue
    case "Rejected":
      return { ...base, backgroundColor: "#d32f2f", color: "#fff" }; // Red
    case "Pending":
      return { ...base, backgroundColor: "#9c27b0", color: "#fff" }; // Purple
    default:
      return { ...base, backgroundColor: "#9c27b0", color: "#fff" }; // Purple (fallback for Pending)
  }
};

/**
 * Returns inline styles for API key status chips on the Approval Queue page.
 * Uses inline styles to ensure proper specificity with Material-UI Chip.
 */
export const getApprovalQueueStatusChipStyle = (phase: string): CSSProperties => {
  const base = { border: "none" };
  switch (phase) {
    case "Approved":
      return { ...base, backgroundColor: "#2e7d32", color: "#fff" }; // Green
    case "Rejected":
      return { ...base, backgroundColor: "#d32f2f", color: "#fff" }; // Red
    case "Pending":
      return { ...base, backgroundColor: "#ed6c02", color: "#fff" }; // Orange
    default:
      return { ...base, backgroundColor: "#ed6c02", color: "#fff" }; // Orange (fallback for Pending)
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
    case "retired":
      return { backgroundColor: "#d32f2f", color: "#fff" }; // Red
    default:
      return {};
  }
};
