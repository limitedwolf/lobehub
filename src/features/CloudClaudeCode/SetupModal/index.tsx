'use client';

import { Button, Flexbox, Text } from '@lobehub/ui';
import { createModal, useModalContext } from '@lobehub/ui/base-ui';
import { Alert, Input, Spin } from 'antd';
import { createStaticStyles } from 'antd-style';
import { t } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SocialConnectButton from '@/layout/AuthProvider/MarketAuth/SocialConnectButton';
import {
  type SocialProfile,
  useSocialConnect,
} from '@/layout/AuthProvider/MarketAuth/useSocialConnect';
import { lambdaClient } from '@/libs/trpc/client';

const CLAUDE_CODE_TOKEN_CRED_KEY = 'CLAUDE_CODE_OAUTH_TOKEN';
const GITHUB_CRED_KEY = 'GITHUB';
const GITHUB_TOKEN_CRED_KEY = 'GITHUB_TOKEN';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-block-start: 24px;
  `,
  code: css`
    display: inline-flex;

    padding-block: 2px;
    padding-inline: 6px;
    border-radius: ${cssVar.borderRadius}px;

    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;

    background: ${cssVar.colorFillTertiary};
  `,
  content: css`
    padding-block: 4px 8px;
    padding-inline: 0;
  `,
  section: css`
    padding: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG}px;
  `,
}));

interface CloudClaudeCodeCredItem {
  id: number;
  key: string;
  name?: string;
}

interface CloudClaudeCodeOAuthConnection {
  avatar?: string;
  email?: string;
  id: number;
  name?: string;
  providerId?: string;
  providerName?: string;
  providerUserName?: string;
}

interface CloudClaudeCodeSetupState {
  claudeCodeTokenCred?: CloudClaudeCodeCredItem;
  githubConnection?: CloudClaudeCodeOAuthConnection;
  githubCred?: CloudClaudeCodeCredItem;
}

const resolveGithubProfile = (
  connection?: CloudClaudeCodeOAuthConnection,
): SocialProfile | null => {
  if (!connection) return null;

  return {
    avatarUrl: connection.avatar,
    id: String(connection.id),
    provider: 'github',
    username:
      connection.providerUserName ||
      connection.email ||
      connection.name ||
      connection.providerName ||
      'github',
  };
};

const getCloudClaudeCodeSetupState = async (): Promise<CloudClaudeCodeSetupState> => {
  const [credsResult, connectionsResult] = await Promise.all([
    lambdaClient.market.creds.list.query(),
    lambdaClient.market.creds.listOAuthConnections.query(),
  ]);

  const creds = (credsResult.data || []) as CloudClaudeCodeCredItem[];
  const connections = (connectionsResult.connections || []) as CloudClaudeCodeOAuthConnection[];

  return {
    claudeCodeTokenCred: creds.find((cred) => cred.key === CLAUDE_CODE_TOKEN_CRED_KEY),
    githubConnection: connections.find((connection) => connection.providerId === 'github'),
    githubCred: creds.find(
      (cred) => cred.key === GITHUB_CRED_KEY || cred.key === GITHUB_TOKEN_CRED_KEY,
    ),
  };
};

const ensureGithubCredential = async (connectionId: number) => {
  await lambdaClient.market.creds.createOAuth.mutate({
    key: GITHUB_CRED_KEY,
    name: 'GitHub OAuth Token',
    oauthConnectionId: connectionId,
  });
};

const createClaudeCodeTokenCredential = async (token: string) => {
  await lambdaClient.market.creds.createKV.mutate({
    key: CLAUDE_CODE_TOKEN_CRED_KEY,
    name: 'Claude Code OAuth Token',
    type: 'kv-env',
    values: {
      [CLAUDE_CODE_TOKEN_CRED_KEY]: token,
    },
  });
};

interface CloudClaudeCodeSetupModalContentProps {
  initialState: CloudClaudeCodeSetupState;
  onCreated: () => void;
}

const CloudClaudeCodeSetupModalContent = ({
  initialState,
  onCreated,
}: CloudClaudeCodeSetupModalContentProps) => {
  const { t } = useTranslation('chat');
  const { close } = useModalContext();
  const [setupState, setSetupState] = useState(initialState);
  const [tokenValue, setTokenValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  const refreshSetupState = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(undefined);

    try {
      const nextState = await getCloudClaudeCodeSetupState();
      setSetupState(nextState);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('cloudClaudeCodeSetup.errors.refresh'),
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [t]);

  const githubConnect = useSocialConnect({
    onConnectSuccess: () => {
      void refreshSetupState();
    },
    provider: 'github',
  });

  useEffect(() => {
    if (!githubConnect.profile && setupState.githubConnection) {
      void githubConnect.fetchProfile();
    }
  }, [githubConnect, setupState.githubConnection]);

  const handleSubmit = useCallback(async () => {
    if (!setupState.claudeCodeTokenCred && !tokenValue.trim()) {
      setErrorMessage(t('cloudClaudeCodeSetup.errors.tokenRequired'));
      return;
    }

    if (!setupState.githubCred && !setupState.githubConnection) {
      setErrorMessage(t('cloudClaudeCodeSetup.errors.githubRequired'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      if (!setupState.claudeCodeTokenCred) {
        await createClaudeCodeTokenCredential(tokenValue.trim());
      }

      if (!setupState.githubCred && setupState.githubConnection) {
        await ensureGithubCredential(setupState.githubConnection.id);
      }

      onCreated();
      close();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('cloudClaudeCodeSetup.errors.submit'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [close, onCreated, setupState, t, tokenValue]);

  const githubProfile = githubConnect.profile || resolveGithubProfile(setupState.githubConnection);

  return (
    <Flexbox className={styles.content} gap={16}>
      <Text type="secondary">{t('cloudClaudeCodeSetup.desc')}</Text>

      {errorMessage && <Alert showIcon message={errorMessage} type="error" />}

      <Flexbox className={styles.section} gap={12}>
        <Flexbox gap={4}>
          <Text strong>{t('cloudClaudeCodeSetup.token.title')}</Text>
          <Text type="secondary">{t('cloudClaudeCodeSetup.token.desc')}</Text>
        </Flexbox>

        {setupState.claudeCodeTokenCred ? (
          <Alert showIcon message={t('cloudClaudeCodeSetup.token.connected')} type="success" />
        ) : (
          <Flexbox gap={12}>
            <Alert showIcon message={t('cloudClaudeCodeSetup.token.hint')} type="info" />
            <Text type="secondary">
              {t('cloudClaudeCodeSetup.token.commandPrefix')}{' '}
              <span className={styles.code}>set token</span>
            </Text>
            <Input.Password
              placeholder={t('cloudClaudeCodeSetup.token.placeholder')}
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
            />
          </Flexbox>
        )}
      </Flexbox>

      <Flexbox className={styles.section} gap={12}>
        <Flexbox gap={4}>
          <Text strong>{t('cloudClaudeCodeSetup.github.title')}</Text>
          <Text type="secondary">{t('cloudClaudeCodeSetup.github.desc')}</Text>
        </Flexbox>

        {setupState.githubCred ? (
          <Alert showIcon message={t('cloudClaudeCodeSetup.github.connected')} type="success" />
        ) : setupState.githubConnection ? (
          <Alert showIcon message={t('cloudClaudeCodeSetup.github.authorized')} type="success" />
        ) : isRefreshing ? (
          <Flexbox align="center" justify="center" style={{ minHeight: 48 }}>
            <Spin />
          </Flexbox>
        ) : (
          <Flexbox gap={12}>
            <SocialConnectButton
              isConnecting={githubConnect.isConnecting}
              isDisconnecting={false}
              profile={githubProfile}
              provider="github"
              onConnect={githubConnect.connect}
              onDisconnect={() => undefined}
            />
            <Text type="secondary">{t('cloudClaudeCodeSetup.github.footer')}</Text>
          </Flexbox>
        )}
      </Flexbox>

      <div className={styles.actions}>
        <Button onClick={close}>{t('cloudClaudeCodeSetup.actions.cancel')}</Button>
        <Button loading={isSubmitting} type="primary" onClick={() => void handleSubmit()}>
          {t('cloudClaudeCodeSetup.actions.confirm')}
        </Button>
      </div>
    </Flexbox>
  );
};

export const openCloudClaudeCodeSetupModal = async (): Promise<boolean> => {
  const initialState = await getCloudClaudeCodeSetupState();

  if (initialState.claudeCodeTokenCred && initialState.githubCred) {
    return true;
  }

  if (
    initialState.claudeCodeTokenCred &&
    initialState.githubConnection &&
    !initialState.githubCred
  ) {
    await ensureGithubCredential(initialState.githubConnection.id);
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let isResolved = false;

    const complete = (result: boolean) => {
      if (isResolved) return;
      isResolved = true;
      resolve(result);
    };

    createModal({
      afterClose: () => complete(false),
      content: (
        <CloudClaudeCodeSetupModalContent
          initialState={initialState}
          onCreated={() => complete(true)}
        />
      ),
      footer: null,
      maskClosable: false,
      title: t('cloudClaudeCodeSetup.title', { ns: 'chat' }),
      width: 'min(92vw, 640px)',
    });
  });
};

export const prepareCloudClaudeCodeSetup = async (): Promise<boolean> => {
  return openCloudClaudeCodeSetupModal();
};

export type { CloudClaudeCodeSetupState };
