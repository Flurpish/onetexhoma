// cms/src/admin/server.ts
import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    // In admin server extensions, Strapi automatically prefixes routes with /admin
    // So this will be exposed as: POST /admin/onetexhoma/ingest/:id
    strapi.server.routes([
      {
        method: 'POST',
        path: '/onetexhoma/ingest/:id', // use 'all' or a numeric id
        handler: async (ctx: Context) => {
          const id = (ctx.params?.id ?? 'all') as string;
          try {
            await strapi.service('api::source-website.ingest').queueIngest({ id });
            ctx.body = { ok: true, id };
          } catch (e: any) {
            strapi.log.error(`admin ingest error: ${e?.message}`);
            ctx.status = 500;
            ctx.body = { ok: false, message: e?.message ?? 'Unknown error' };
          }
        },
        config: {
          policies: ['admin::isAuthenticatedAdmin'],
          middlewares: [],
        },
      },
    ]);
  },
  bootstrap() {},
};
