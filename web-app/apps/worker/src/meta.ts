import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env.local') });

export interface MetaConfig {
  baseUrl: string;
  apiKeyConfigured: boolean;
  sparkModel: string;
  wonderModel: string;
  samModel: string;
  saltbreakUrl: string;
  atlasUrl: string;
}

/** Direct-Meta client configuration. Stub: reads env, makes no calls yet. */
export function metaConfig(): MetaConfig {
  return {
    baseUrl: process.env.META_BASE_URL ?? 'https://api.meta.ai/v1',
    apiKeyConfigured: Boolean(process.env.MODEL_API_KEY),
    sparkModel: process.env.SPARK_MODEL ?? 'muse-spark-1.3',
    wonderModel: process.env.WONDER_MODEL ?? 'muse-wonder-1.0',
    samModel: process.env.SAM_MODEL ?? 'sam-3.1',
    saltbreakUrl: process.env.SALTBREAK_URL ?? 'http://localhost:3000',
    atlasUrl: process.env.ATLAS_URL ?? 'http://localhost:3001',
  };
}
