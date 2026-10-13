/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Cloudflare Worker API, e.g. https://leads-api.yourname.workers.dev */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
