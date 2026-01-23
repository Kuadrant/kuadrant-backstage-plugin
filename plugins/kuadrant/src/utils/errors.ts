export async function handleFetchError(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({}));

  switch (response.status) {
    case 400:
      return errorData.error || 'Invalid request. Please check your input.';
    case 403:
      return 'Permission denied. Contact your administrator.';
    case 404:
      return 'Resource not found. It may have been deleted.';
    case 409:
      return 'Resource already exists or conflicts with existing data.';
    case 500:
      return 'Server error. Please try again or contact support.';
    default:
      return errorData.error || `Request failed (${response.status})`;
  }
}
