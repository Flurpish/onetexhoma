import { url } from "inspector";

type EnvFn = (key: string, defaultValue?: unknown) => string;

export default ({ env }: { env: EnvFn }) => ({
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', 1338)),
  url: env('PUBLIC_URL', 'http://localhost:1338'),
  app: {
    // Provide a default so dev runs even without APP_KEYS set
    keys: (env('APP_KEYS', 'a,b,c') as string).split(','),
  },
});
