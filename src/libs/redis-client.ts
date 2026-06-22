import { getRedisConfig } from '@/envs/redis';
import { initializeRedis, isRedisEnabled } from '@/libs/redis';
import type { BaseRedisProvider } from '@/libs/redis/types';

export const isRedisClientEnabled = () => isRedisEnabled(getRedisConfig());

export const getRedisClient = async (): Promise<BaseRedisProvider | null> => {
  const config = getRedisConfig();
  if (!isRedisEnabled(config)) return null;

  return initializeRedis(config);
};
