export default {
  routes: [
    {
      method: 'POST',
      path: '/source-websites/:id/run-now',
      handler: 'run-now.run',
      config: { policies: [], middlewares: [] },
    },
  ],
};

