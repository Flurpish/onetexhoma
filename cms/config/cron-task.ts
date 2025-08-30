import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

export default {
  ingestHourly: {
    options: { rule: '0 * * * *' },
    task: async ({ strapi }: { strapi: Core.Strapi }) => {
      const cmd = process.env.INGEST_CMD || 'npx tsx --env-file=../../.env src/ingest.ts';
      const cwd = path.resolve(process.cwd(), 'services', 'ingestor');

      strapi.log.info(`[cron] spawn "${cmd}" (cwd=${cwd})`);
      const child = spawn(cmd, {
        cwd,
        shell: true,
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          STRAPI_URL: process.env.STRAPI_URL || `http://localhost:${process.env.PORT || 1338}`,
          INGESTOR_STRAPI_TOKEN: process.env.INGESTOR_STRAPI_TOKEN || '',
          INGEST_ONLY_SOURCE_ID: '', // run all
        },
      });
      child.unref();
    },
  },
};
