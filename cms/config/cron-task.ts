// cms/config/cron-tasks.ts
export default {
  'ingest.sweep': {
    task: async ({ strapi }) => {
      const svc = strapi.service('api::source-website.ingest') as any;
      await svc.ingestAll();
    },
    options: { rule: '0 */1 * * *' }, // every 2 hours
  },
};
