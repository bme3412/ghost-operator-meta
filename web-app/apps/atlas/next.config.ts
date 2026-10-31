import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  serverExternalPackages: ['@atlas/data'],
};

export default config;
