/// <reference types="vite/client" />

declare const __BUILD_ID__: string;
declare const __BUILT_AT__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
