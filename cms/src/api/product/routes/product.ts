import { factories } from '@strapi/strapi';
export default factories.createCoreRouter('api::product.product', {
  // be explicit so POST/PUT/DELETE are mounted
  only: ['find', 'findOne', 'create', 'update', 'delete'],
});
