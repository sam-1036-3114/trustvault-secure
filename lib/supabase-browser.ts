import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  if (!clientInstance) {
    clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return clientInstance;
}
