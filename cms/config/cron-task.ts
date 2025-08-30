import type { Core } from '@strapi/strapi';
export default {
  ingestHourly: {
    options: { rule: '0 * * * *' },
    task: async ({ strapi }: { strapi: Core.Strapi }) => {
      try {
        await strapi.service('api::source-website.ingest').ingestAll();
      } catch (e: any) {
        strapi.log.error(`ingestHourly failed: ${e?.message || e}`);
      }
    },
  },
};