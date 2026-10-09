// One shared Supabase client (realtime + auth + RPCs). Null when online features aren't configured.
var KV_SB = (function () {
  var c = null;
  return function () {
    if (!c && window.supabase && KV_CONFIG.SUPABASE_URL && KV_CONFIG.SUPABASE_ANON_KEY) {
      c = window.supabase.createClient(KV_CONFIG.SUPABASE_URL, KV_CONFIG.SUPABASE_ANON_KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    }
    return c;
  };
})();
