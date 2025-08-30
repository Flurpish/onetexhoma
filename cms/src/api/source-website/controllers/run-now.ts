import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async run(ctx) {
    const { id } = ctx.params;
    if (!id) return ctx.badRequest('Missing id');

    // NOTE: we won't rely on findOne here (see client workaround below)
    ctx.body = { ok: true, id: Number(id) };
  },
});
