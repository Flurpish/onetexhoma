// cms/src/admin/app.tsx
// No JSX here; no extra TS types needed.
import { getFetchClient } from '@strapi/strapi/admin';

const PLUGIN_UID = 'api::source-website.source-website';
const ADMIN_RUN_PATH = '/admin/onetexhoma/ingest';

function makeRefreshAction(position: 'panel' | 'header') {
  // This function conforms to CM "document action" signature
  return ({ model, documentId }: { model: string; documentId?: string }) => {
    // Debug log so you can see when CM asks us to render
    console.log('[onetexhoma] RefreshAction invoked', { position, model, documentId });

    // Show only on SourceWebsite edit view, and only for existing entries
    if (model !== PLUGIN_UID || !documentId) return undefined;

    return {
      label: 'Refresh now',
      position,                       // 'panel' (right-side) or 'header' (top)
      variant: position === 'panel' ? 'secondary' : 'default',
      onClick: async () => {
        try {
          const { post } = getFetchClient();
          await post(`${ADMIN_RUN_PATH}/${documentId}`);
          console.log('[onetexhoma] queued refresh for', documentId);
          // Returning true shows the success dialog below
          return true;
        } catch (e) {
          console.error('[onetexhoma] refresh failed', e);
          return false;
        }
      },
      // Simple success toast (Strapi shows this when onClick returns truthy)
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

    // Add a button to the right-side panel
    if (typeof apis.addDocumentAction === 'function') {
      apis.addDocumentAction((actions: any[]) => {
        console.log('[onetexhoma] addDocumentAction (panel) — existing:', actions?.length ?? 0);
        return [...(actions ?? []), makeRefreshAction('panel')];
      });
    } else {
      console.warn('[onetexhoma] addDocumentAction unavailable');
    }

    // Also add one to the header (optional; remove if you only want one place)
    if (typeof apis.addDocumentHeaderAction === 'function') {
      apis.addDocumentHeaderAction((actions: any[]) => {
        console.log('[onetexhoma] addDocumentHeaderAction (header) — existing:', actions?.length ?? 0);
        return [...(actions ?? []), makeRefreshAction('header')];
      });
    } else {
      console.warn('[onetexhoma] addDocumentHeaderAction unavailable');
    }

    console.log('[onetexhoma] Refresh actions registered');
  },

  async registerTrads() {
    // keep for v5 shape; translate strings if you want later
    return { en: {} };
  },
};
