// frontend/src/account/supabaseClient.js
// Purpose: Singleton Supabase client, dormant when env config is absent so
// the game runs account-free in unconfigured builds.
// Imports From: @supabase/supabase-js
// Exported To: ./useAuth.js, ./gameSync.js, ./AccountModal.jsx

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_KEY || '';

export const supabase = url && key ? createClient(url, key) : null;

export function accountsEnabled() {
  return Boolean(supabase);
}
