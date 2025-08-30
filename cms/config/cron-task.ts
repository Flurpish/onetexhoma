export default {
  // Every hour at minute 0
  ingestHourly: {
    options: { rule: '0 * * * *' },
    task: async ({ strapi }) => {
      try {
        await strapi.service('api::source-website.ingest').ingestAll();
      } catch (e:any) {
        strapi.log.error(`ingestHourly failed: ${e.message}`);
      }
    },
  },
};
