// King's Vendetta configuration: rule toggles + online settings.
// The Supabase anon key is MEANT to be public (it only allows Realtime broadcast/presence here).
var KV_CONFIG = {
  SUPABASE_URL: 'https://xuejozfijzsqxezwjjid.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZWpvemZpanpzcXhlendqamlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NjQ1NjEsImV4cCI6MjEwNzE0MDU2MX0.9tKu0R6VRpgoIw6RrE6Yqobnsqp28x7wL2OR22h6zrE',

  BUILD: '20261009-1732',               // replaced by deploy script with a timestamp

  // Rules
  ADVANCE_BACK_ROW: true,     // back card moves forward when the front card in its column dies
  COMPACT_DIRECTION: 'center',// 'center' | 'left' | 'right' - where empty columns are squeezed out
  QUAD_SHAPE: 'choose',       // 'choose' (left or right 2x2 block around LOS target) | 'right' | 'left'
  TEAM_SIZE: 12,
  GENERAL_SLOT: 8,            // starting slot for the General (back row, col 2)

  // UI
  AI_THINK_MS: 600,
  SHIFT_MS: 200,
};
if (typeof module !== 'undefined') module.exports = KV_CONFIG;
