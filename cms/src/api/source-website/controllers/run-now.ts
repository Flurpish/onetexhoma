// cms/src/api/source-website/controllers/run-now.ts
import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::source-website.source-website',
  ({ strapi }) => ({
    async run(ctx) {
      const id = Number(ctx.params.id);
      const svc = strapi.service('api::source-website.ingest') as any;
      const result = await svc.ingestAll({ onlyId: id });
      ctx.body = { ok: true, ...result };
    },
  })
);
