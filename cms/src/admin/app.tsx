import React from 'react';
import RefreshButton from './components/refreshButton'; // NOTE: exact casing

export default {
  register(app: any) {},
  bootstrap(app: any) {
    const cm = app.getPlugin('content-manager');
    cm?.injectComponent?.('editView', 'right-links', {
      name: 'onetexhoma-refresh',
      Component: RefreshButton, // pass a React component (not a Promise)
    });
  },
  async registerTrads() {
    return { en: {} };
  },
};
