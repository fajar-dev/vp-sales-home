/**
 * Returns formatted API URL taking into account environment base path.
 * Defaults to '/' (no prefix).
 */
export function getApiUrl(path: string): string {
  const rawBasePath =
    process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "/";

  // In Next.js, a root base path '/' is equivalent to no prefix ('')
  const basePath =
    rawBasePath === "/" ? "" : rawBasePath.trim().replace(/\/$/, "");

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${cleanPath}`;
}
