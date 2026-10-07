import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;

export const supabase = createClient(
  supabaseUrl,
  import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
);