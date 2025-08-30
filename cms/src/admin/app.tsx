// cms/src/admin/app.tsx
export default {
  register(app: any) {
    const cm = app.getPlugin('content-manager');
    cm?.injectComponent?.('editView', 'right-links', {
      name: 'onetexhoma-refresh',
      // lazy load component to match v5 recommendations
      Component: async () => (await import('./components/refreshButton')).default,
    });
  },
  bootstrap() {},
  async registerTrads() { return { en: {} }; },
};
