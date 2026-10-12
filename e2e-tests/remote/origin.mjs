export function backstageOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("BASE_URL must be an absolute HTTP or HTTPS URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "BASE_URL must be the Backstage origin (HTTP or HTTPS, without credentials, a path, query or fragment)",
    );
  return url.origin;
}
