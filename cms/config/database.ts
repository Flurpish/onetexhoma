import path from 'path';

type EnvFn = (key: string, defaultValue?: unknown) => string;

export default ({ env }: { env: EnvFn }) => {
  type Client = 'sqlite' | 'postgres' | 'mysql';
  const client = env('DATABASE_CLIENT', 'postgres') as Client;

  // Common SSL flag
  const ssl =
    env('DATABASE_SSL', 'false') === 'true'
      ? { rejectUnauthorized: env('DATABASE_SSL_REJECT_UNAUTHORIZED', 'false') === 'true' }
      : false;

  if (client === 'postgres' || client === 'mysql') {
    const url = env('DATABASE_URL', '');

    if (url) {
      return {
        connection: {
          client,
          connection: {
            connectionString: url,
            ssl, // depending on host, may be false or an object
          },
          pool: { min: 2, max: 10 },
        },
      };
    }

    // Fallback to discrete fields
    const common = {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: Number(env('DATABASE_PORT', client === 'postgres' ? 5432 : 3306)),
      database: env('DATABASE_NAME', 'strapi'),
      user: env('DATABASE_USERNAME', 'strapi'),
      password: env('DATABASE_PASSWORD', 'strapi'),
      ssl,
    };

    return {
      connection: {
        client,
        connection: common,
        pool: { min: 2, max: 10 },
      },
    };
  }

  // sqlite
  return {
    connection: {
      client: 'sqlite',
      connection: {
        filename: env('DATABASE_FILENAME', path.resolve(process.cwd(), '.tmp', 'data.db')),
      },
      useNullAsDefault: true,
    },
  };
};
