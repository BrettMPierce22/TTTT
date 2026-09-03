import { createClient } from "@supabase/supabase-js";
import { createRecoveryIntent, inspectAuthRedirect } from "../features/auth/emailRecovery";

export const authRedirect = inspectAuthRedirect(window.location.href);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

// Listen before React mounts, so a validated recovery event cannot be lost
// during initial page loading. URL hints alone never start password recovery.
const recoveryIntent = createRecoveryIntent({ storage: {
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
} });
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") recoveryIntent.begin(session?.user?.id);
  if (event === "SIGNED_OUT") recoveryIntent.clear();
});
