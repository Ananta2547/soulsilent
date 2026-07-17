import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext();
  return env.DB;
}

export async function getR2(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext();
  return env.R2;
}

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as CloudflareEnv;
}
