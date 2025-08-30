import React from 'react';
import RefreshButton from './components/refreshButton'; // <-- static import

export default {
  register(app: any) {
    const cm = app.getPlugin('content-manager');
    cm?.injectComponent?.('editView', 'right-links', {
      name: 'onetexhoma-refresh',
      Component: RefreshButton, // <-- pass a component, not a promise
    });
  },
  bootstrap() {},
  async registerTrads() {
    return { en: {} };
  },
};
