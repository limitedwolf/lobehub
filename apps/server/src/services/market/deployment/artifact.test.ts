import { describe, expect, it } from 'vitest';

import { extractHtmlArtifact } from './artifact';

describe('extractHtmlArtifact', () => {
  it('extracts a closed text/html artifact by identifier', () => {
    const artifact = extractHtmlArtifact(
      '<lobeArtifact identifier="page" type="text/html" title="Landing"><main>OK</main></lobeArtifact>',
      'page',
    );

    expect(artifact).toEqual({
      content: '<main>OK</main>',
      title: 'Landing',
      type: 'text/html',
    });
  });

  it('unwraps fenced html content', () => {
    const artifact = extractHtmlArtifact(
      '<lobeArtifact identifier="page" type="html">```html\n<div>OK</div>\n```</lobeArtifact>',
      'page',
    );

    expect(artifact?.content).toBe('<div>OK</div>');
  });

  it('rejects incomplete or non-html artifacts', () => {
    expect(
      extractHtmlArtifact(
        '<lobeArtifact identifier="page" type="text/html"><main>OK</main>',
        'page',
      ),
    ).toBeNull();
    expect(
      extractHtmlArtifact(
        '<lobeArtifact identifier="page" type="application/lobe.artifacts.react">export default function App(){}</lobeArtifact>',
        'page',
      ),
    ).toBeNull();
  });
});
