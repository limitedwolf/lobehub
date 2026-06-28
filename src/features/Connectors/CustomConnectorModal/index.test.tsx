/**
 * @vitest-environment happy-dom
 */
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CustomConnectorModal from './index';

type DevModalValue = {
  customParams?: {
    avatar?: string;
    description?: string;
    mcp?: Record<string, unknown>;
  };
  identifier: string;
};

type EditFetchedData = {
  credentials:
    | { headers: Record<string, string>; type: 'header' }
    | { token: string; type: 'bearer' }
    | null;
  oidcConfig: { clientId?: string } | null;
};

// Captures the props CustomConnectorModal hands to DevModal so the test can
// drive `onSave` directly (the real DevModal is a heavy Drawer form).
const devModal = vi.hoisted(() => ({
  onSave: undefined as
    | ((value: DevModalValue, ctx?: { oauthPopup?: Window | null }) => Promise<void>)
    | undefined,
  value: undefined as DevModalValue | undefined,
}));

const mocks = vi.hoisted(() => ({
  toolState: {
    connectors: [] as Array<{
      id: string;
      identifier: string;
      mcpConnectionType?: string;
      mcpServerUrl?: string;
      metadata?: Record<string, unknown>;
      name: string;
    }>,
    createConnector: vi.fn(async (_params: Record<string, any>) => 'new-connector-id'),
    fetchConnectors: vi.fn(),
    getConnectorForEdit: vi.fn(
      async (): Promise<EditFetchedData> => ({ credentials: null, oidcConfig: null }),
    ),
    startConnectorOAuth: vi.fn(),
    syncConnectorTools: vi.fn(),
    uninstallCustomPlugin: vi.fn(),
    updateConnector: vi.fn(),
  },
}));

vi.mock('@/store/tool', () => ({
  useToolStore<T>(selector: (state: typeof mocks.toolState) => T): T {
    return selector(mocks.toolState);
  },
}));

vi.mock('@/store/tool/slices/connector', () => ({
  connectorSelectors: {
    connectorById:
      (connectorId: string) =>
      (state: typeof mocks.toolState): (typeof mocks.toolState.connectors)[number] | undefined =>
        state.connectors.find((connector) => connector.id === connectorId),
  },
}));

vi.mock('@/features/PluginDevModal', () => ({
  default: (props: {
    onSave: NonNullable<typeof devModal.onSave>;
    value?: DevModalValue;
  }) => {
    devModal.onSave = props.onSave;
    devModal.value = props.value;
    return <div data-testid="dev-modal" />;
  },
}));

describe('CustomConnectorModal handleSave metadata persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    devModal.onSave = undefined;
    devModal.value = undefined;
    mocks.toolState.connectors = [];
  });

  it('passes description/avatar as metadata when creating', async () => {
    render(<CustomConnectorModal open onClose={vi.fn()} />);

    await devModal.onSave!({
      customParams: {
        avatar: 'https://example.com/a.png',
        // leading/trailing whitespace must be trimmed before persisting
        description: '  My MCP  ',
        mcp: { auth: { type: 'none' }, type: 'http', url: 'https://mcp.example.com' },
      },
      identifier: 'my-mcp',
    });

    expect(mocks.toolState.createConnector).toHaveBeenCalledTimes(1);
    expect(mocks.toolState.createConnector.mock.calls[0][0]).toMatchObject({
      metadata: { avatar: 'https://example.com/a.png', description: 'My MCP' },
    });
    expect(mocks.toolState.syncConnectorTools).toHaveBeenCalledWith('new-connector-id');
  });

  it('omits metadata when neither description nor avatar is set on create', async () => {
    render(<CustomConnectorModal open onClose={vi.fn()} />);

    await devModal.onSave!({
      customParams: { mcp: { auth: { type: 'none' }, type: 'http', url: 'https://mcp.example.com' } },
      identifier: 'bare-mcp',
    });

    expect(mocks.toolState.createConnector.mock.calls[0][0].metadata).toBeUndefined();
  });

  it('merges description/avatar into the patch when editing, preserving other metadata keys', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://mcp.example.com',
        metadata: { avatar: 'https://old.png', description: 'old', migratedFromCustomPlugin: true },
        name: 'my-mcp',
      },
    ];

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);
    // Wait for the edit-mode credential fetch to resolve so DevModal re-seeds.
    await waitFor(() => expect(mocks.toolState.getConnectorForEdit).toHaveBeenCalled());

    await devModal.onSave!({
      customParams: {
        // avatar cleared by the user → should be dropped from metadata
        avatar: '',
        description: 'New desc',
        // same URL → credentials/url handling unchanged
        mcp: { auth: { type: 'none' }, type: 'http', url: 'https://mcp.example.com' },
      },
      identifier: 'my-mcp',
    });

    expect(mocks.toolState.updateConnector).toHaveBeenCalledTimes(1);
    const [id, patch] = mocks.toolState.updateConnector.mock.calls[0];
    expect(id).toBe('c1');
    // migratedFromCustomPlugin preserved; description updated; cleared avatar removed.
    expect(patch.metadata).toEqual({ description: 'New desc', migratedFromCustomPlugin: true });
    // existing bearer/header save logic must remain intact (no-auth → cleared).
    expect(patch.credentials).toBeNull();
  });

  it('prefills avatar from connector.metadata when reopening the edit modal', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://mcp.example.com',
        metadata: { avatar: 'https://avatar.png', description: 'desc' },
        name: 'my-mcp',
      },
    ];

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(devModal.value?.customParams?.avatar).toBe('https://avatar.png');
      expect(devModal.value?.customParams?.description).toBe('desc');
    });
  });

  // Scenario 1 (create) — custom headers must persist alongside display metadata.
  it('persists custom headers as credentials when creating', async () => {
    render(<CustomConnectorModal open onClose={vi.fn()} />);

    await devModal.onSave!({
      customParams: {
        avatar: 'https://example.com/a.png',
        description: 'My MCP',
        mcp: {
          // auth radio 'none' + Advanced-section headers → header credentials.
          auth: { type: 'none' },
          headers: { Authorization: 'Bearer xyz', 'X-Api-Key': 'secret' },
          type: 'http',
          url: 'https://mcp.example.com',
        },
      },
      identifier: 'my-mcp',
    });

    const arg = mocks.toolState.createConnector.mock.calls[0][0];
    expect(arg.metadata).toEqual({ avatar: 'https://example.com/a.png', description: 'My MCP' });
    expect(arg.credentials).toEqual({
      headers: { Authorization: 'Bearer xyz', 'X-Api-Key': 'secret' },
      type: 'header',
    });
    expect(mocks.toolState.syncConnectorTools).toHaveBeenCalledWith('new-connector-id');
  });

  // Scenario 3 (edit) — editing ONLY the URL must keep description/avatar but
  // intentionally clear credentials (they may not be valid for the new server).
  it('preserves description/avatar metadata but clears credentials when only the URL changes', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://old.example.com',
        metadata: { avatar: 'https://avatar.png', description: 'desc' },
        name: 'my-mcp',
      },
    ];

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.toolState.getConnectorForEdit).toHaveBeenCalled());

    await devModal.onSave!({
      customParams: {
        // unchanged display fields (prefilled from metadata) come back as-is
        avatar: 'https://avatar.png',
        description: 'desc',
        mcp: {
          auth: { type: 'none' },
          // only the URL is different
          type: 'http',
          url: 'https://new.example.com',
        },
      },
      identifier: 'my-mcp',
    });

    const [id, patch] = mocks.toolState.updateConnector.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch.mcpServerUrl).toBe('https://new.example.com');
    expect(patch.metadata).toEqual({ avatar: 'https://avatar.png', description: 'desc' });
    // URL changed → stale credentials wiped (expected behavior).
    expect(patch.credentials).toBeNull();
  });

  // Regression guard for PR #15909 — bearer token must survive an edit where the
  // URL is unchanged (re-saving display fields should not drop the token).
  it('keeps the bearer token on edit when the URL is unchanged (PR #15909 regression)', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://mcp.example.com',
        metadata: { description: 'desc' },
        name: 'my-mcp',
      },
    ];
    mocks.toolState.getConnectorForEdit.mockResolvedValueOnce({
      credentials: { token: 'tok-123', type: 'bearer' },
      oidcConfig: null,
    } satisfies EditFetchedData);

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.toolState.getConnectorForEdit).toHaveBeenCalled());

    await devModal.onSave!({
      customParams: {
        description: 'desc edited',
        mcp: {
          auth: { token: 'tok-123', type: 'bearer' },
          type: 'http',
          url: 'https://mcp.example.com',
        },
      },
      identifier: 'my-mcp',
    });

    const [, patch] = mocks.toolState.updateConnector.mock.calls[0];
    expect(patch.credentials).toEqual({ token: 'tok-123', type: 'bearer' });
    expect(patch.metadata).toEqual({ description: 'desc edited' });
  });

  // Regression guard for PR #15909 — custom headers must survive an edit where
  // the URL is unchanged.
  it('keeps custom headers on edit when the URL is unchanged (PR #15909 regression)', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://mcp.example.com',
        metadata: {},
        name: 'my-mcp',
      },
    ];
    mocks.toolState.getConnectorForEdit.mockResolvedValueOnce({
      credentials: { headers: { 'X-Api-Key': 'secret' }, type: 'header' },
      oidcConfig: null,
    } satisfies EditFetchedData);

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.toolState.getConnectorForEdit).toHaveBeenCalled());

    await devModal.onSave!({
      customParams: {
        mcp: {
          // header auth surfaces as radio 'none' with headers in Advanced.
          auth: { type: 'none' },
          headers: { 'X-Api-Key': 'secret' },
          type: 'http',
          url: 'https://mcp.example.com',
        },
      },
      identifier: 'my-mcp',
    });

    const [, patch] = mocks.toolState.updateConnector.mock.calls[0];
    expect(patch.credentials).toEqual({ headers: { 'X-Api-Key': 'secret' }, type: 'header' });
  });

  // Regression guard for PR #15909 — reopening the edit modal must backfill the
  // bearer token and headers, not just the display metadata.
  it('backfills bearer token and headers into the form when reopening edit', async () => {
    mocks.toolState.connectors = [
      {
        id: 'c1',
        identifier: 'my-mcp',
        mcpConnectionType: 'http',
        mcpServerUrl: 'https://mcp.example.com',
        metadata: { description: 'desc' },
        name: 'my-mcp',
      },
    ];
    mocks.toolState.getConnectorForEdit.mockResolvedValueOnce({
      credentials: { token: 'tok-123', type: 'bearer' },
      oidcConfig: null,
    } satisfies EditFetchedData);

    render(<CustomConnectorModal connectorId="c1" open onClose={vi.fn()} />);

    await waitFor(() => {
      const mcp = devModal.value?.customParams?.mcp as
        | { auth?: { token?: string; type?: string } }
        | undefined;
      expect(mcp?.auth?.type).toBe('bearer');
      expect(mcp?.auth?.token).toBe('tok-123');
    });
  });
});
