// config/database.ts
type GetEnv<T> = (key: string, defaultValue?: T) => T | undefined;

type StrapiEnv = GetEnv<string> & {
  int: GetEnv<number>;
  float: GetEnv<number>;
  bool: GetEnv<boolean>;
  json: <T = unknown>(key: string, defaultValue?: T) => T;
  array: <T = string>(key: string, defaultValue?: T[]) => T[] | undefined;
};

interface ConfigCtx {
  env: StrapiEnv;
}

export default ({ env }: ConfigCtx) => ({
  connection: {
    client: 'postgres',
    connection: {
      // If you set DATABASE_URL, knex will use it; otherwise these fallbacks apply
      connectionString: env('DATABASE_URL'),
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME', 'strapi'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'strapi'),
      schema: env('DATABASE_SCHEMA', 'public'),
      ssl: env.bool('DATABASE_SSL', false)
        ? { rejectUnauthorized: env.bool('DATABASE_SSL_SELF', false) }
        : false,
    },
    pool: { min: env.int('DATABASE_POOL_MIN', 2), max: env.int('DATABASE_POOL_MAX', 10) },
    debug: false,
  },
});
