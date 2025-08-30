export default {
  // every hour
  ingestHourly: {
    task: async ({ strapi }) => {
      // call your existing controller/service logic
      await strapi.controller('api::source-website.run-now').run({ params: { id: 'all' } } as any);
    },
    options: { rule: '0 * * * *' },
  },
};
