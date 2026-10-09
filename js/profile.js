// Player profile: card collection, 20-card deck, coins, chests, Elo rating, cosmetics.
// Stored on this device (localStorage). Use the backup code in Profile to move it to another device.
var KV_PROFILE = (function () {
  var KEY = 'kv-profile';
  var DECK_SIZE = 20;
  var RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  var RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  var CHESTS = {
    wood:   { name: 'Wooden Chest', icon: '📦', cardChance: 0.55, coins: [20, 40],   odds: { common: 60, uncommon: 30, rare: 8, epic: 2, legendary: 0 } },
    silver: { name: 'Silver Chest', icon: '🧰', cardChance: 0.6,  coins: [50, 90],   odds: { common: 30, uncommon: 40, rare: 20, epic: 8, legendary: 2 } },
    gold:   { name: 'Golden Chest', icon: '👑', cardChance: 0.7,  coins: [120, 200], odds: { common: 10, uncommon: 30, rare: 35, epic: 18, legendary: 7 } },
  };
  var THEMES = [
    { id: 'default', name: 'Castle Stone', price: 0 },
    { id: 'crimson', name: 'Crimson Keep', price: 150 },
    { id: 'forest', name: 'Emerald Forest', price: 150 },
    { id: 'midnight', name: 'Midnight Siege', price: 250 },
    { id: 'gold', name: 'Gold Leaf', price: 400 },
  ];
  var TIERS = [[1400, 'Diamond', '💎'], [1250, 'Platinum', '🔷'], [1100, 'Gold', '🥇'], [950, 'Silver', '🥈'], [0, 'Bronze', '🥉']];

  function cards() { return KV_CARDS.filter(function (c) { return c.ready && c.key !== 'general'; }); }
  function starters() { return cards().filter(function (c) { return c.starter; }).map(function (c) { return c.key; }); }

  function load() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!p || !p.owned) {
      p = { v: 1, owned: starters(), deck: starters().slice(0, DECK_SIZE), coins: 0, rating: 1000,
        wins: 0, losses: 0, draws: 0, rankedGames: 0, themes: ['default'], theme: 'default', awarded: {} };
    }
    if (!p.clientId) p.clientId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    p.copies = p.copies || {};   // extra copies of owned cards (from chests), spent on upgrades
    p.levels = p.levels || {};   // card level (1 = base). Each level adds +1 Life.
    p.campaign = p.campaign || 0; // stages cleared
    if (!p.secret) p.secret = Array.from({ length: 4 }, function () { return Math.random().toString(36).slice(2, 10); }).join('');
    // new starter cards added later are granted automatically
    starters().forEach(function (k) { if (p.owned.indexOf(k) < 0) p.owned.push(k); });
    var valid = {};
    cards().forEach(function (c) { valid[c.key] = 1; });
    p.owned = p.owned.filter(function (k) { return valid[k]; });
    p.deck = p.deck.filter(function (k) { return valid[k] && p.owned.indexOf(k) >= 0; });
    return p;
  }
  var P = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  save();

  // Deck used for a game: the chosen cards, topped up from the collection if fewer than 11 are picked
  function deckForGame() {
    var d = P.deck.slice();
    if (d.length < 11) P.owned.forEach(function (k) { if (d.indexOf(k) < 0 && d.length < DECK_SIZE) d.push(k); });
    return d;
  }

  // ---- upgrades: level 2 = 2 extra copies + 100 coins, level 3 = 4 more copies + 300 coins ----
  var UPGRADES = { 2: { copies: 2, coins: 100 }, 3: { copies: 4, coins: 300 } };
  var MAX_LEVEL = 3;
  function level(key) { return P.levels[key] || 1; }
  function upgradeCost(key) { var next = level(key) + 1; return next > MAX_LEVEL ? null : { level: next, copies: UPGRADES[next].copies, coins: UPGRADES[next].coins }; }
  function canUpgrade(key) { var c = upgradeCost(key); return !!c && P.owned.indexOf(key) >= 0 && (P.copies[key] || 0) >= c.copies && P.coins >= c.coins; }
  function upgrade(key) {
    if (!canUpgrade(key)) return false;
    var c = upgradeCost(key);
    P.copies[key] -= c.copies; P.coins -= c.coins; P.levels[key] = c.level;
    save(); return true;
  }
  function levelsForGame() { var m = {}; Object.keys(P.levels).forEach(function (k) { if (P.levels[k] > 1) m[k] = P.levels[k]; }); return m; }

  function toggleDeck(key) {
    var i = P.deck.indexOf(key);
    if (i >= 0) P.deck.splice(i, 1);
    else if (P.owned.indexOf(key) >= 0 && P.deck.length < DECK_SIZE) P.deck.push(key);
    else return false;
    save(); return true;
  }

  // Mythic: a Diamond rating AND a top-100 spot on the shared leaderboard.
  var MYTHIC_RANK = 100, DIAMOND = 1400;
  function tier(r, rank) {
    if (r >= DIAMOND && rank && rank <= MYTHIC_RANK) return { name: 'Mythic', icon: '🔮', mythic: true, rank: rank };
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i][0]) return { name: TIERS[i][1], icon: TIERS[i][2] };
    return { name: 'Bronze', icon: '🥉' };
  }

  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function weighted(odds) {
    var tot = 0, k; for (k in odds) tot += odds[k];
    var x = Math.random() * tot;
    for (k in odds) { x -= odds[k]; if (x < 0) return k; }
    return 'common';
  }

  function rollChest(won) {
    var x = Math.random();
    if (won) return x < 0.5 ? 'wood' : x < 0.85 ? 'silver' : 'gold';
    return x < 0.7 ? 'wood' : x < 0.95 ? 'silver' : 'gold';
  }

  function openChest(type) {
    var ch = CHESTS[type];
    if (Math.random() < ch.cardChance) {
      var want = weighted(ch.odds), order = [want].concat(RARITIES.filter(function (r) { return r !== want; }));
      for (var i = 0; i < order.length; i++) {
        var all = cards().filter(function (c) { return c.rarity === order[i]; });
        var locked = all.filter(function (c) { return P.owned.indexOf(c.key) < 0; });
        var owned = all.filter(function (c) { return P.owned.indexOf(c.key) >= 0 && level(c.key) < MAX_LEVEL; });
        if (locked.length && (!owned.length || Math.random() < 0.65)) {
          var c = locked[Math.floor(Math.random() * locked.length)];
          P.owned.push(c.key);
          if (P.deck.length < DECK_SIZE) P.deck.push(c.key);
          save();
          return { kind: 'card', key: c.key, name: c.name, rarity: c.rarity };
        }
        if (owned.length) {
          var d = owned[Math.floor(Math.random() * owned.length)];
          P.copies[d.key] = (P.copies[d.key] || 0) + 1;
          save();
          return { kind: 'copy', key: d.key, name: d.name, rarity: d.rarity, copies: P.copies[d.key] };
        }
      }
    }
    var coins = rand(ch.coins[0], ch.coins[1]);
    P.coins += coins; save();
    return { kind: 'coins', coins: coins };
  }

  // Called once per finished game. Returns {chest, elo} or null if this game was already counted.
  // Campaign stage won: first clear gives the stage reward and unlocks the next stage
  function campaignWin(index, reward) {
    if (index !== P.campaign) return null;
    P.campaign = index + 1;
    P.coins += reward.coins; save();
    return reward;
  }

  function recordGame(info) {
    if (!info.gameId || P.awarded[info.gameId]) return null;
    P.awarded[info.gameId] = Date.now();
    var keys = Object.keys(P.awarded);
    if (keys.length > 200) keys.sort(function (a, b) { return P.awarded[a] - P.awarded[b]; }).slice(0, keys.length - 200).forEach(function (k) { delete P.awarded[k]; });
    if (info.draw) P.draws++; else if (info.won) P.wins++; else P.losses++;
    var elo = null;
    if (info.ranked && info.oppRating) {
      var exp = 1 / (1 + Math.pow(10, (info.oppRating - P.rating) / 400));
      var score = info.draw ? 0.5 : info.won ? 1 : 0;
      var delta = Math.round(32 * (score - exp));
      P.rating += delta; P.rankedGames++;
      elo = { delta: delta, rating: P.rating, tier: tier(P.rating, P.rank) };
    }
    save();
    return { chest: info.forfeit ? null : rollChest(info.won), elo: elo };
  }

  function buyTheme(id) {
    var t = THEMES.filter(function (x) { return x.id === id; })[0];
    if (!t) return false;
    if (P.themes.indexOf(id) < 0) {
      if (P.coins < t.price) return false;
      P.coins -= t.price; P.themes.push(id);
    }
    P.theme = id; save(); applyTheme();
    return true;
  }
  function applyTheme() { document.documentElement.setAttribute('data-board', P.theme || 'default'); }

  function backupCode() {
    var data = { copies: P.copies, levels: P.levels, campaign: P.campaign, owned: P.owned, deck: P.deck, coins: P.coins, rating: P.rating, wins: P.wins, losses: P.losses, draws: P.draws, themes: P.themes, theme: P.theme, rankedGames: P.rankedGames,
      clientId: P.clientId, secret: P.secret };
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function restore(code) {
    try {
      var d = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!d.owned || !d.deck) return false;
      Object.keys(d).forEach(function (k) { P[k] = d[k]; });
      save(); P = load(); save(); applyTheme();
      return true;
    } catch (e) { return false; }
  }

  // ---- shared leaderboard (Supabase RPCs; the table itself is locked) ----
  var sb = null;
  function client() {
    if (!sb && window.supabase && KV_CONFIG.SUPABASE_URL) sb = window.supabase.createClient(KV_CONFIG.SUPABASE_URL, KV_CONFIG.SUPABASE_ANON_KEY);
    return sb;
  }
  function syncLeaderboard(name) {
    var c = client();
    if (!c || !P.rankedGames) return Promise.resolve(false);
    return c.rpc('kv_submit', { p_client_id: P.clientId, p_secret: P.secret, p_name: (name || 'Player').slice(0, 16), p_rating: P.rating,
      p_wins: P.wins, p_losses: P.losses, p_draws: P.draws, p_ranked_games: P.rankedGames })
      .then(function (r) { return !r.error && r.data === true; }, function () { return false; });
  }
  // My global position (cached on the profile for the Mythic badge)
  function fetchRank() {
    var c = client();
    if (!c || !P.rankedGames) return Promise.resolve(null);
    return c.rpc('kv_rank', { p_client_id: P.clientId }).then(function (r) {
      if (!r.error) { P.rank = r.data || null; save(); }
      return P.rank;
    }, function () { return P.rank; });
  }
  function myTier() { return tier(P.rating, P.rank); }
  function fetchLeaderboard() {
    var c = client();
    if (!c) return Promise.resolve([]);
    return c.rpc('kv_leaderboard', { p_limit: 100 }).then(function (r) { return r.error ? [] : r.data; }, function () { return []; });
  }

  return {
    get: function () { return P; }, syncLeaderboard: syncLeaderboard, fetchRank: fetchRank, myTier: myTier, fetchLeaderboard: fetchLeaderboard, save: save, DECK_SIZE: DECK_SIZE, RARITY_LABEL: RARITY_LABEL, CHESTS: CHESTS, THEMES: THEMES,
    deckForGame: deckForGame, level: level, upgradeCost: upgradeCost, canUpgrade: canUpgrade, upgrade: upgrade,
    levelsForGame: levelsForGame, MAX_LEVEL: MAX_LEVEL, campaignWin: campaignWin, toggleDeck: toggleDeck, tier: tier, openChest: openChest, recordGame: recordGame,
    buyTheme: buyTheme, applyTheme: applyTheme, backupCode: backupCode, restore: restore, cards: cards,
  };
})();
