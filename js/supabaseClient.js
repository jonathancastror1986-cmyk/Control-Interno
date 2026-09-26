// Requiere que supabaseConfig.js y el script de @supabase/supabase-js
// se hayan cargado antes que este archivo.
window.supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);
