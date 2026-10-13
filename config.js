// King's Vendetta configuration: rule toggles + online settings.
// The Supabase anon key is MEANT to be public (it only allows Realtime broadcast/presence here).
var KV_CONFIG = {
  SUPABASE_URL: 'https://xuejozfijzsqxezwjjid.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZWpvemZpanpzcXhlendqamlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NjQ1NjEsImV4cCI6MjEwNzE0MDU2MX0.9tKu0R6VRpgoIw6RrE6Yqobnsqp28x7wL2OR22h6zrE',

  GOOGLE_SIGNIN: false,       // flip to true once Google OAuth is configured in Supabase

  BUILD: '20261013-2022',               // replaced by deploy script with a timestamp

  // Rules
  ADVANCE_BACK_ROW: true,     // back card moves forward when the front card in its column dies
  COMPACT_DIRECTION: 'center',// 'center' | 'left' | 'right' - where empty columns are squeezed out
  QUAD_SHAPE: 'choose',       // 'choose' (left or right 2x2 block around LOS target) | 'right' | 'left'
  TEAM_SIZE: 12,
  STALEMATE_TURNS: 30,
  TURN_SWAP: 'any',           // on your turn you may switch two of your cards instead of attacking: 'any' | 'adjacent' | 'off'
  WIN_BY_WIPE: true,          // also win by killing every enemy card except their General
  TERRAIN: true,              // random terrain per column (hill, fortress, forest, swamp, scorched)
  EVENTS: true,               // battlefield events every EVENT_EVERY turns
  EVENT_EVERY: 6,
  HEROES: true,               // pick a General hero power before battle
  WISP_MAJOR_PER_ROUND: 2,    // Wisps summoned per round by Wisp Major (card text says all empty slots)
  SUDDEN_DEATH_TURN: 100,     // after this many turns every attack gets +1, +1 more every 10 turns (games always end)
  RANKED_BOT_WAIT_MS: 20000,  // ranked queue: humans first; after this long a rated bot fills in
  MAX_LIFE: 12,               // hard cap on any card's Life (levels, auras, buffs never go above this)
  LOS_NEAREST: true,          // if the enemy column in front of you is empty, line of sight reaches the nearest enemy column
  GENERAL_SLOT: 8,            // starting slot for the General (back row, col 2)

  // UI
  AI_THINK_MS: 600,
  SHIFT_MS: 200,
};
if (typeof module !== 'undefined') module.exports = KV_CONFIG;
