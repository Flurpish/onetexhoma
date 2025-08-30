// cms/src/extensions/users-permissions/strapi-server.ts
import type { Context } from 'koa';               // ✔ Koa type for ctx
import type { Core } from '@strapi/strapi';       // (optional) if you need Strapi types

export default (plugin: any) => {
  plugin.controllers['onetexhoma-ingest'] = {
    async run(ctx: Context) {
      const { documentId } = ctx.params as { documentId?: string };
      if (!documentId) {
        ctx.status = 400;
        ctx.body = { ok: false, error: 'missing_documentId' };
        return;
      }

      const docs = await strapi
        .documents('api::source-website.source-website')
        .findMany({ filters: { documentId }, fields: ['id'], limit: 1 });

      const entry = docs?.[0];
      if (!entry) {
        ctx.status = 404;
        ctx.body = { ok: false, error: 'not_found', documentId };
        return;
      }

      ctx.status = 200;
      ctx.body = { ok: true, id: entry.id, documentId };
    },
  };

  plugin.routes['admin'].routes.push({
    method: 'POST',
    path: '/onetexhoma/ingest/:documentId',
    handler: 'onetexhoma-ingest.run',
    config: { policies: ['admin::isAuthenticatedAdmin'] },
  });

  return plugin;
};
