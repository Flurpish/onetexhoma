import React from 'react';
import { Button } from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';

const RefreshButton: React.FC = () => {
  const { post } = useFetchClient();
  const { toggleNotification } = useNotification();

  // CM edit path: /content-manager/collectionType/<uid>/<documentId>
  const parts = window.location.pathname.split('/').filter(Boolean);
  const uid = decodeURIComponent(parts[2] || '');
  const documentId = decodeURIComponent(parts[3] || '');

  // Only render on SourceWebsite edit view
  if (uid !== 'api::source-website.source-website' || !documentId) return null;

  const onClick = async () => {
    try {
      await post(`/admin/onetexhoma/ingest/${documentId}`);
      toggleNotification({ type: 'success', message: 'Refresh queued!' });
    } catch (e) {
      console.error(e);
      toggleNotification({ type: 'danger', message: 'Failed to queue refresh' });
    }
  };

  return (
    <div style={{ marginLeft: 8 }}>
      <Button size="S" variant="secondary" onClick={onClick}>
        Refresh now
      </Button>
    </div>
  );
};

export default RefreshButton;
