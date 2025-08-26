export default {
  routes: [
    { method: 'GET',    path: '/source-websites',      handler: 'source-website.find' },
    { method: 'GET',    path: '/source-websites/:id',  handler: 'source-website.findOne' },
    { method: 'POST',   path: '/source-websites',      handler: 'source-website.create' },
    { method: 'PUT',    path: '/source-websites/:id',  handler: 'source-website.update' },
    { method: 'DELETE', path: '/source-websites/:id',  handler: 'source-website.delete' },
  ],
};
