import type { Context } from 'koa';
import type { Core } from '@strapi/strapi';
import { spawn } from 'node:child_process';
import path from 'node:path';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(ctx: Context) {
    const { id } = ctx.params as { id?: string };
    if (!id) return ctx.badRequest('Missing id');

    // ✅ Use a command that works from services/ingestor without npm scripts
    // You can override with INGEST_CMD if you want something else.
    const cmd = process.env.INGEST_CMD || 'npx tsx --env-file=../../.env src/ingest.ts';

    // ✅ Run from the *ingestor* folder (this is where src/ingest.ts lives)
    const cwd = path.resolve(process.cwd(), 'services', 'ingestor');

    // DEV TIP: set INGEST_ATTACH=1 to stream logs in the Strapi console
    const attach = process.env.INGEST_ATTACH === '1';

    try {
      strapi.log.info(`[run-now] spawn "${cmd}" (cwd=${cwd}) for sourceId=${id} attach=${attach}`);

      const child = spawn(cmd, {
        cwd,
        shell: true,                  // Windows-friendly
        detached: !attach,            // detach when not attaching
        stdio: attach ? 'inherit' : 'ignore',
        env: {
          ...process.env,
          STRAPI_URL: process.env.STRAPI_URL || `http://localhost:${process.env.PORT || 1338}`,
          INGESTOR_STRAPI_TOKEN: process.env.INGESTOR_STRAPI_TOKEN || '',
          // optional: run only this source (ingestor can read this)
          INGEST_ONLY_SOURCE_ID: String(id),
        },
      });

      if (!attach) child.unref();

      ctx.status = 200;
      ctx.body = { ok: true, started: true, sourceId: Number(id) };
    } catch (e: any) {
      strapi.log.error(`[run-now] failed: ${e?.stack || e?.message || String(e)}`);
      ctx.status = 500;
      ctx.body = { ok: false, error: e?.message || 'internal_error' };
    }
  },
});
