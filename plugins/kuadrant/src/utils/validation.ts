// Kubernetes name validation
export const validateKubernetesName = (value: string): string | null => {
  if (!value || !value.trim()) {
    return 'Name is required';
  }
  if (value.length > 253) {
    return 'Must be 253 characters or less';
  }

  const dns1123Regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

  if (!dns1123Regex.test(value)) {
    return 'Must be lowercase alphanumeric with hyphens, start and end with alphanumeric';
  }

  return null;
};

// URL validation
export const validateURL = (value: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'Must be a valid HTTP or HTTPS URL';
    }
    return null;
  } catch {
    return 'Must be a valid URL';
  }
};
