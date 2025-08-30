// cms/src/index.ts
import type { Core } from '@strapi/strapi';

export default {
  async register() {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const stack: any[] = (strapi.server as any)?.koa?.middleware || [];
    const lines: string[] = [];

    // Koa stack includes router layers; print paths/methods we can see
    for (const layer of stack) {
      const route = (layer as any).router?.opts?.prefix;
      const stackRoutes = (layer as any).router?.stack ?? [];
      for (const r of stackRoutes) {
        const path = r.path;
        const methods = (r.methods || []).join(',');
        if (path?.startsWith('/api/')) lines.push(`${methods.padEnd(10)} ${path}`);
      }
    }
    lines.sort();
    console.log('[routes]\n' + lines.join('\n'));
  },
};
