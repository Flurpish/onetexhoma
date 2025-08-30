import React from 'react';
import { Button } from '@strapi/design-system';
import { request } from '@strapi/helper-plugin';

const RefreshButton = ({ layout }) => {
  const uid = layout?.uid;
  // only show on SourceWebsite CT
  if (uid !== 'api::source-website.source-website') return null;

  // read id from the header layout context (current entity)
  const id = window.location.pathname.split('/').pop(); // /content-manager/collectionType/api::source-website.source-website/42

  const onClick = async () => {
    try {
      const res = await request(`/admin/onetexhoma/ingest/${id}`, { method: 'POST' });
      strapi.notification.toggle({
        type: 'success',
        message: { id: 'refresh.now.success', defaultMessage: 'Refresh queued!' },
      });
    } catch (e) {
      console.error(e);
      strapi.notification.toggle({
        type: 'warning',
        message: { id: 'refresh.now.fail', defaultMessage: 'Failed to queue refresh' },
      });
    }
  };

  return (
    <div style={{ marginLeft: 8 }}>
      <Button size="S" variant="secondary" onClick={onClick}>Refresh now</Button>
    </div>
  );
};

export default {
  register(app) {
    // Inject in Content Manager edit view (right side actions)
    app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
      name: 'onetexhoma-refresh',
      Component: RefreshButton,
    });
  },
  bootstrap() {},
};
