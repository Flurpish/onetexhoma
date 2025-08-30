export default [
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      headers: '*',
      origin: ['http://localhost:5173', 'https://onetexhoma.netlify.app', 'https://onetexhoma.com'], // Vite dev
    },
  },
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
