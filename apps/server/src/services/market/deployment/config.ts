export interface MarketDeploymentConfig {
  maxHtmlBytes: number;
  publicBaseUrl: string;
  r2AccessKeyId: string;
  r2AccountId: string;
  r2Bucket: string;
  r2SecretAccessKey: string;
}

const DEFAULT_MAX_HTML_BYTES = 1024 * 1024;

export const getMarketDeploymentConfig = (): MarketDeploymentConfig | null => {
  const publicBaseUrl = process.env.MARKET_DEPLOYMENT_PUBLIC_BASE_URL;
  const r2AccountId = process.env.MARKET_DEPLOYMENT_R2_ACCOUNT_ID;
  const r2Bucket = process.env.MARKET_DEPLOYMENT_R2_BUCKET;
  const r2AccessKeyId = process.env.MARKET_DEPLOYMENT_R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.MARKET_DEPLOYMENT_R2_SECRET_ACCESS_KEY;

  if (!publicBaseUrl || !r2AccountId || !r2Bucket || !r2AccessKeyId || !r2SecretAccessKey) {
    return null;
  }

  return {
    maxHtmlBytes: Number(process.env.MARKET_DEPLOYMENT_MAX_HTML_BYTES) || DEFAULT_MAX_HTML_BYTES,
    publicBaseUrl,
    r2AccessKeyId,
    r2AccountId,
    r2Bucket,
    r2SecretAccessKey,
  };
};
