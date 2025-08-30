import { url } from "inspector";
import cronTask from "./cron-task";

type EnvFn = (key: string, defaultValue?: unknown) => string;

export default ({ env }: { env: EnvFn }) => ({
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', 1338)),
  url: env('PUBLIC_URL', 'http://localhost:1338'),
  cron: { enabled: true, tasks: cronTask},
  app: {
    // Provide a default so dev runs even without APP_KEYS set
    keys: (env('APP_KEYS', 'a,b,c') as string).split(','),
  },
});
