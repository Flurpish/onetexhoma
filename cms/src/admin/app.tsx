// cms/src/admin/app.tsx
import { getFetchClient } from '@strapi/strapi/admin';

const UID = 'api::source-website.source-website';

async function getNumericId(documentId: string) {
  // Admin CM API returns the entry by documentId
  // Example path (v5): /content-manager/collection-types/<uid>/<documentId>
  const { get } = getFetchClient();
  const res = await get(
    `/content-manager/collection-types/${encodeURIComponent(UID)}/${encodeURIComponent(documentId)}?fields=id`
  );

  // shape can vary; handle both common shapes
  const data = (res?.data && (res.data.data || res.data)) || res;
  const id = data?.id ?? data?.data?.id;
  if (!id) throw new Error('Could not resolve numeric id from documentId');
  return id as number;
}

function makeRefreshAction(position: 'panel' | 'header') {
  return ({ model, documentId }: { model: string; documentId?: string }) => {
    console.log('[onetexhoma] RefreshAction invoked', { position, model, documentId });

    if (model !== UID || !documentId) return undefined;

    return {
      label: 'Refresh now',
      position,
      variant: position === 'panel' ? 'secondary' : 'default',

      onClick: async () => {
        try {
          const id = await getNumericId(documentId);
          console.log('[onetexhoma] resolved', { documentId, id });

          // Call your existing route: POST /api/source-websites/:id/run-now
          const { post } = getFetchClient();
          const out = await post(`/api/source-websites/${id}/run-now`);
          console.log('[onetexhoma] run-now ok', out?.data ?? out);

          return true; // show success toast
        } catch (e) {
          console.error('[onetexhoma] run-now failed', e);
          return false;
        }
      },

      dialog: {
        type: 'notification',
        title: 'Refresh queued!',
        status: 'success',
        timeout: 2500,
      },
    };
  };
}

export default {
  register(app: any) {},

  bootstrap(app: any) {
    const cm = app.getPlugin('content-manager');
    const apis = (cm as any)?.apis;
    if (!apis) {
      console.warn('[onetexhoma] content-manager apis not available');
      return;
    }

    if (typeof apis.addDocumentAction === 'function') {
      apis.addDocumentAction((actions: any[]) => [
        ...(actions ?? []),
        makeRefreshAction('panel'),
      ]);
    }
    if (typeof apis.addDocumentHeaderAction === 'function') {
      apis.addDocumentHeaderAction((actions: any[]) => [
        ...(actions ?? []),
        makeRefreshAction('header'),
      ]);
    }

    console.log('[onetexhoma] Refresh actions registered');
  },

  async registerTrads() {
    return { en: {} };
  },
};
