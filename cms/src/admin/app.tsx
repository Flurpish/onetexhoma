import React from 'react';
import RefreshButton from './components/refreshButton'; // static import (works both locally & on Cloud)

export default {
  // You can leave register empty for this use-case
  register(app: any) {},

  bootstrap(app: any) {
    const cm = app.getPlugin('content-manager');
    cm?.injectComponent?.('editView', 'right-links', {
      name: 'onetexhoma-refresh',
      Component: RefreshButton, // pass a React component, not a function/promise
    });

    // (optional) quick sanity log in the browser console:
    // console.log('[onetexhoma] injected RefreshButton into CM editView/right-links');
  },

  async registerTrads() {
    return { en: {} };
  },
};
