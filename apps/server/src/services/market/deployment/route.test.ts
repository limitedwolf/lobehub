import { describe, expect, it } from 'vitest';

import {
  buildDeploymentUrl,
  getHtmlArtifactR2Key,
  getHtmlArtifactRoutePath,
  normalizeDeploymentSlug,
} from './route';

describe('market deployment route helpers', () => {
  it('builds stable html artifact paths with sanitized slugs', () => {
    expect(getHtmlArtifactRoutePath('hero-page', 'My Landing Page!')).toBe(
      '/a/hero-page-my-landing-page',
    );
    expect(getHtmlArtifactRoutePath('hero-page')).toBe('/a/hero-page-artifact');
  });

  it('builds deterministic R2 keys and public urls', () => {
    expect(getHtmlArtifactR2Key('hero-page')).toBe('html-artifacts/hero-page/index.html');
    expect(buildDeploymentUrl('https://example.com/', '/a/hero-page-artifact')).toBe(
      'https://example.com/a/hero-page-artifact',
    );
  });

  it('normalizes empty slugs to the default slug', () => {
    expect(normalizeDeploymentSlug('  ---  ')).toBe('artifact');
  });
});
