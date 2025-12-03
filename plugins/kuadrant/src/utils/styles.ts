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
