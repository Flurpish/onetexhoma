// cms/src/api/source-website/controllers/run-now.ts
import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';
import { spawn } from 'node:child_process';
import path from 'node:path';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(ctx: Context) {
    const { id } = ctx.params as { id?: string };
    if (!id) return ctx.badRequest('Missing id');

    const mode = process.env.INGEST_MODE || 'spawn'; // set to 'internal' on Strapi Cloud

    if (mode === 'internal') {
      // ✅ Cloud path: run inside the process
      const result = await strapi.service('api::source-website.ingest').ingestAll({ onlyId: Number(id) });
      ctx.body = { ok: true, mode, ...result };
      return;
    }

    // 🧪 Local/dev path: spawn external script (your existing behavior)
    const cmd = process.env.INGEST_CMD || 'npx tsx --env-file=../../.env src/ingest.ts';
    const cwd = path.resolve(process.cwd(), 'services', 'ingestor');
    const attach = process.env.INGEST_ATTACH === '1';

    const child = spawn(cmd, {
      cwd,
      shell: true,
      detached: !attach,
      stdio: attach ? 'inherit' : 'ignore',
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || `http://localhost:${process.env.PORT || 1338}`,
        INGESTOR_STRAPI_TOKEN: process.env.INGESTOR_STRAPI_TOKEN || '',
        INGEST_ONLY_SOURCE_ID: String(id),
      },
    });
    if (!attach) child.unref();

    ctx.body = { ok: true, mode, started: true, sourceId: Number(id) };
  },
});
