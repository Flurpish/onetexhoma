import { factories } from '@strapi/strapi';

// Mount all standard Content API routes, including GET /api/source-websites/:id
export default factories.createCoreRouter('api::source-website.source-website', {
  // being explicit ensures nothing trimmed accidentally
  only: ['find', 'findOne', 'create', 'update', 'delete'],
});
