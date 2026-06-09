const DEFAULT_SLUG = 'artifact';

const trimSlashes = (value: string) => value.replaceAll(/^\/+|\/+$/g, '');

export const normalizeDeploymentBaseUrl = (baseUrl: string) => trimSlashes(baseUrl.trim());

export const normalizeDeploymentSlug = (value?: string | null) => {
  const slug = value
    ?.trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return slug || DEFAULT_SLUG;
};

export const getHtmlArtifactRoutePath = (artifactIdentifier: string, slug?: string | null) =>
  `/a/${artifactIdentifier}-${normalizeDeploymentSlug(slug)}`;

export const getHtmlArtifactR2Key = (artifactIdentifier: string) =>
  `html-artifacts/${artifactIdentifier}/index.html`;

export const buildDeploymentUrl = (baseUrl: string, path: string) =>
  `${normalizeDeploymentBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
