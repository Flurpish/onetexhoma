// config/database.ts
type Env = {
  (key: string, defaultValue?: unknown): string;
  int: (key: string, defaultValue?: number) => number;
  bool: (key: string, defaultValue?: boolean) => boolean;
};

export default ({ env }: { env: Env }) => {
  const useSSL = env.bool('DATABASE_SSL', false);
  const rejectUnauthorized = env.bool('DATABASE_SSL_REJECT_UNAUTHORIZED', false);

  return {
    connection: {
      client: 'postgres',
      connection: {
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', 5432),
        database: env('DATABASE_NAME', 'strapi'),
        user: env('DATABASE_USERNAME', 'strapi'),
        password: env('DATABASE_PASSWORD', ''),
        schema: env('DATABASE_SCHEMA', 'public'),
        ssl: useSSL ? { rejectUnauthorized } : false,
      },
      pool: { min: 0, max: 10 },
    },
  };
};
