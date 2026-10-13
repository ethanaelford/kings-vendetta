// Player profile: card collection, 20-card deck, coins, chests, Elo rating, cosmetics.
// Stored on this device (localStorage). Use the backup code in Profile to move it to another device.
var KV_PROFILE = (function () {
  var KEY = 'kv-profile';
  var DECK_SIZE = 20;
  var RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  var RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };
  function img(path, cls) { return '<img class="' + (cls || 'ico') + '" src="images/ui/' + path + '.png" alt="">'; }
  // Chest art from sprites3: <id>.png and <id>_open.png. price = buyable in the shop.
  var CHESTS = {
    wood:      { name: 'Wooden Chest',    cardChance: 0.55, coins: [20, 40],   odds: { common: 60, uncommon: 30, rare: 8,  epic: 2,  legendary: 0 } },
    silver:    { name: 'Silver Chest',    cardChance: 0.6,  coins: [50, 90],   odds: { common: 30, uncommon: 40, rare: 20, epic: 8,  legendary: 2 } },
    gold:      { name: 'Golden Chest',    cardChance: 0.7,  coins: [120, 200], odds: { common: 10, uncommon: 30, rare: 35, epic: 18, legendary: 7 } },
    epic:      { name: 'Epic Chest',      cardChance: 0.8,  coins: [250, 400], odds: { common: 0,  uncommon: 15, rare: 40, epic: 33, legendary: 10, mythic: 2 } },
    legendary: { name: 'Legendary Chest', cardChance: 0.9,  coins: [500, 800], odds: { common: 0,  uncommon: 0,  rare: 30, epic: 42, legendary: 23, mythic: 5 } },
    royal:     { name: 'Royal Chest',     cardChance: 0.75, coins: [150, 260], odds: { common: 5,  uncommon: 25, rare: 40, epic: 22, legendary: 8 },  price: 300 },
    frost:     { name: 'Frost Chest',     cardChance: 0.85, coins: [300, 450], odds: { common: 0,  uncommon: 10, rare: 40, epic: 36, legendary: 11, mythic: 3 }, price: 650 },
    infernal:  { name: 'Infernal Chest',  cardChance: 0.9,  coins: [600, 900], odds: { common: 0,  uncommon: 0,  rare: 25, epic: 42, legendary: 27, mythic: 6 }, price: 1200 },
  };
  Object.keys(CHESTS).forEach(function (k) { CHESTS[k].icon = img('chest_' + k); CHESTS[k].art = 'images/ui/chest_' + k + '.png'; CHESTS[k].openArt = 'images/ui/chest_' + k + '_open.png'; });

  // Cosmetics: kind -> list. Board tiles come from sprites3 terrain.
  var COSMETICS = {
    board: [
      { id: 'default', name: 'Castle Stone', price: 0 },
      { id: 'meadow', name: 'Green Meadow', price: 100, tile: 't_grass' },
      { id: 'desert', name: 'Desert Sands', price: 120, tile: 't_sand' },
      { id: 'cobble', name: 'Old Road', price: 120, tile: 't_cobble' },
      { id: 'timber', name: 'Timber Fort', price: 150, tile: 't_planks' },
      { id: 'crimson', name: 'Crimson Keep', price: 150 },
      { id: 'forest', name: 'Emerald Forest', price: 150 },
      { id: 'snow', name: 'Snowfield', price: 200, tile: 't_snow' },
      { id: 'keep', name: 'Mossy Keep', price: 200, tile: 't_mossbrick' },
      { id: 'midnight', name: 'Midnight Siege', price: 250 },
      { id: 'ocean', name: 'Open Sea', price: 300, tile: 't_water' },
      { id: 'gold', name: 'Gold Leaf', price: 400 },
      { id: 'lava', name: 'Lava Fields', price: 500, tile: 't_lava' },
      { id: 'void', name: 'The Void', price: 750, tile: 't_void' },
    ],
    frame: [
      { id: 'iron', name: 'Iron', price: 0, color: '#3566b8' },
      { id: 'bronze', name: 'Bronze', price: 100, color: '#b0703a' },
      { id: 'silver', name: 'Silver', price: 200, color: '#c9d1d9' },
      { id: 'gold', name: 'Gold', price: 350, color: '#e6b422' },
      { id: 'emerald', name: 'Emerald', price: 350, color: '#2fbf71' },
      { id: 'crystal', name: 'Crystal', price: 500, color: '#7fd8ff', glow: true },
      { id: 'amethyst', name: 'Amethyst', price: 500, color: '#a46bff', glow: true },
      { id: 'inferno', name: 'Inferno', price: 800, color: '#ff5a1f', glow: true },
    ],
    dice: [
      { id: 'parchment', name: 'Parchment', price: 0, bg: '#f4ead2', fg: '#24180c' },
      { id: 'obsidian', name: 'Obsidian', price: 150, bg: '#1d1a24', fg: '#e8e0ff' },
      { id: 'ruby', name: 'Ruby', price: 200, bg: '#9b1b30', fg: '#fff' },
      { id: 'ice', name: 'Ice', price: 200, bg: '#bfe9ff', fg: '#0b3a5c' },
      { id: 'emerald', name: 'Emerald', price: 250, bg: '#1f7a4a', fg: '#fff' },
      { id: 'gold', name: 'Royal Gold', price: 400, bg: '#e6b422', fg: '#3a2500' },
    ],
  };
  var THEMES = COSMETICS.board;

  // Ranks (art from sprites3). Legendary = Grandmaster rating AND a top-100 spot on the shared leaderboard.
  var TIERS = [[1600, 'grandmaster', 'Grandmaster'], [1500, 'master', 'Master'], [1400, 'diamond', 'Diamond'], [1250, 'platinum', 'Platinum'],
    [1100, 'gold', 'Gold'], [950, 'silver', 'Silver'], [0, 'bronze', 'Bronze']];

  function cards() { return KV_CARDS.filter(function (c) { return c.ready && c.key !== 'general'; }); }
  function starters() { return cards().filter(function (c) { return c.starter; }).map(function (c) { return c.key; }); }

  function load() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!p || !p.owned) {
      p = { v: 1, owned: starters(), deck: starters().slice(0, DECK_SIZE), coins: 0, rating: 1000,
        wins: 0, losses: 0, draws: 0, rankedGames: 0, themes: ['default'], theme: 'default', awarded: {} };
    }
    if (!p.frames) { p.frames = ['iron']; p.frame = 'iron'; }
    if (!p.diceSkins) { p.diceSkins = ['parchment']; p.diceSkin = 'parchment'; }
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

  // ---- monthly seasons ----
  // At a new month: your old-season rank earns a season chest, and your rating soft-resets halfway to 1000.
  var SEASON_CHEST = { bronze: 'wood', silver: 'silver', gold: 'gold', platinum: 'royal', diamond: 'epic', master: 'frost', grandmaster: 'infernal', legendary: 'legendary' };
  function seasonId(d) { d = d || new Date(); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }
  function seasonName(id) {
    var parts = (id || seasonId()).split('-');
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+parts[1] - 1] + ' ' + parts[0];
  }
  function seasonDaysLeft() {
    var d = new Date(), end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    return Math.max(0, Math.ceil((end - d.getTime()) / 86400000));
  }
  function rollSeason() {
    var now = seasonId();
    if (!P.season) { P.season = now; P.seasonGames = P.seasonGames || 0; return; }
    if (P.season === now) return;
    if (P.seasonGames > 0) {
      var t = tier(P.rating, P.rank);
      P.seasonReward = { season: P.season, tier: t.id, tierName: t.name, rating: P.rating, chest: SEASON_CHEST[t.id] || 'wood' };
    }
    P.rating = 1000 + Math.round((P.rating - 1000) / 2);
    P.rank = null; P.seasonGames = 0; P.season = now;
  }
  function claimSeasonReward() {
    var r = P.seasonReward; if (!r) return null;
    P.seasonReward = null; save();
    return r;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {}
    if (account && account.user && !applying) { P.dirty = true; schedulePush(); }
  }
  rollSeason();
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

  // Deck codes: "KV1-" + 2 base-36 chars per card (its position in the card list). Short enough to text.
  function deckCode(deck) {
    var idx = (deck || P.deck).map(function (k) { return KV_CARDS.findIndex(function (c) { return c.key === k; }); })
      .filter(function (i) { return i >= 0; }).sort(function (a, b) { return a - b; });
    return 'KV1-' + idx.map(function (i) { return ('0' + i.toString(36)).slice(-2); }).join('').toUpperCase();
  }
  function parseDeckCode(code) {
    var m = String(code || '').trim().toUpperCase().replace(/\s/g, '').match(/^KV1-([0-9A-Z]+)$/);
    if (!m || m[1].length % 2) return null;
    var keys = [];
    for (var i = 0; i < m[1].length; i += 2) {
      var c = KV_CARDS[parseInt(m[1].substr(i, 2), 36)];
      if (c && c.ready && c.key !== 'general' && keys.indexOf(c.key) < 0) keys.push(c.key);
    }
    return keys;
  }
  // Use a deck code: keeps the cards you own (up to 20). Returns {used, missing:[names]} or null for a bad code.
  function importDeck(code) {
    var keys = parseDeckCode(code);
    if (!keys) return null;
    var used = keys.filter(function (k) { return P.owned.indexOf(k) >= 0; }).slice(0, DECK_SIZE);
    var missing = keys.filter(function (k) { return P.owned.indexOf(k) < 0; }).map(function (k) { return KV_RULES.cardDef(k).name; });
    if (!used.length) return { used: 0, missing: missing };
    P.deck = used; save();
    return { used: used.length, missing: missing };
  }

  function toggleDeck(key) {
    var i = P.deck.indexOf(key);
    if (i >= 0) P.deck.splice(i, 1);
    else if (P.owned.indexOf(key) >= 0 && P.deck.length < DECK_SIZE) P.deck.push(key);
    else return false;
    save(); return true;
  }

  // Mythic: a Diamond rating AND a top-100 spot on the shared leaderboard.
  var LEGEND_RANK = 100, LEGEND_RATING = 1600;
  function tierObj(id, name, extra) {
    var t = { id: id, name: name, icon: img('rank_' + id), badge: 'images/ui/rank_' + id + '.png', banner: 'images/ui/banner_' + id + '.png' };
    Object.keys(extra || {}).forEach(function (k) { t[k] = extra[k]; });
    return t;
  }
  function tier(r, rank) {
    if (r >= (LEGEND_RATING || 1600) && rank && rank <= (LEGEND_RANK || 100)) return tierObj('legendary', 'Legendary', { mythic: true, rank: rank });
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i][0]) return tierObj(TIERS[i][1], TIERS[i][2]);
    return tierObj('bronze', 'Bronze');
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
    if (won) return x < 0.45 ? 'wood' : x < 0.77 ? 'silver' : x < 0.95 ? 'gold' : 'epic';
    return x < 0.7 ? 'wood' : x < 0.95 ? 'silver' : 'gold';
  }

  function openChest(type) {
    var ch = CHESTS[type];
    if (Math.random() < ch.cardChance) {
      var want = weighted(ch.odds), order = [want].concat(RARITIES.filter(function (r) { return r !== want; }));
      for (var i = 0; i < order.length; i++) {
        var all = cards().filter(function (c) { return c.rarity === order[i]; });
        // super-rare cards (Grim Reaper) only make it through 1 time in 8
        var locked = all.filter(function (c) { return P.owned.indexOf(c.key) < 0 && (!c.superRare || Math.random() < 0.125); });
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
      rollSeason();
      P.rating += delta; P.rankedGames++; P.seasonGames = (P.seasonGames || 0) + 1;
      elo = { delta: delta, rating: P.rating, tier: tier(P.rating, P.rank) };
    }
    save();
    return { chest: info.forfeit ? null : rollChest(info.won), elo: elo };
  }

  // owned/equipped field names per cosmetic kind
  var COS_FIELDS = { board: ['themes', 'theme'], frame: ['frames', 'frame'], dice: ['diceSkins', 'diceSkin'] };
  function owns(kind, id) { return (P[COS_FIELDS[kind][0]] || []).indexOf(id) >= 0; }
  function equipped(kind) { return P[COS_FIELDS[kind][1]]; }
  // Buy (if needed) and equip. Returns false if not enough coins.
  function buyCosmetic(kind, id) {
    var item = COSMETICS[kind].filter(function (x) { return x.id === id; })[0];
    if (!item) return false;
    var f = COS_FIELDS[kind];
    P[f[0]] = P[f[0]] || [COSMETICS[kind][0].id];
    if (P[f[0]].indexOf(id) < 0) {
      if (P.coins < item.price) return false;
      P.coins -= item.price; P[f[0]].push(id);
    }
    P[f[1]] = id; save(); applyTheme();
    return true;
  }
  function buyTheme(id) { return buyCosmetic('board', id); }
  function buyChest(id) {
    var c = CHESTS[id];
    if (!c || !c.price || P.coins < c.price) return false;
    P.coins -= c.price; save();
    return true;
  }
  function applyTheme() {
    var root = document.documentElement;
    var b = COSMETICS.board.filter(function (x) { return x.id === (P.theme || 'default'); })[0] || COSMETICS.board[0];
    root.setAttribute('data-board', b.tile ? 'tile' : b.id);
    root.style.setProperty('--board-tile', b.tile ? 'url(images/ui/' + b.tile + '.png)' : 'none');
    var fr = COSMETICS.frame.filter(function (x) { return x.id === (P.frame || 'iron'); })[0] || COSMETICS.frame[0];
    root.style.setProperty('--frame', fr.color);
    root.setAttribute('data-frame-glow', fr.glow ? 'on' : 'off');
    var d = COSMETICS.dice.filter(function (x) { return x.id === (P.diceSkin || 'parchment'); })[0] || COSMETICS.dice[0];
    root.style.setProperty('--die-bg', d.bg); root.style.setProperty('--die-fg', d.fg);
  }

  function backupCode() {
    var data = { frames: P.frames, frame: P.frame, diceSkins: P.diceSkins, diceSkin: P.diceSkin, copies: P.copies, levels: P.levels, campaign: P.campaign, owned: P.owned, deck: P.deck, coins: P.coins, rating: P.rating, wins: P.wins, losses: P.losses, draws: P.draws, themes: P.themes, theme: P.theme, rankedGames: P.rankedGames,
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

  // ---- accounts: Google sign-in + cloud save (kv_profiles, one row per user, RLS-protected) ----
  var account = { user: null, status: 'signed-out', onChange: null, onConflict: null };
  var applying = false, pushTimer = null;
  var SYNC_FIELDS = ['season', 'seasonGames', 'seasonReward', 'owned', 'deck', 'coins', 'rating', 'wins', 'losses', 'draws', 'rankedGames', 'themes', 'theme', 'frames', 'frame', 'diceSkins', 'diceSkin',
    'copies', 'levels', 'campaign', 'clientId', 'secret', 'rank'];
  function exportData() { var d = {}; SYNC_FIELDS.forEach(function (k) { d[k] = P[k]; }); return d; }
  function importData(d) {
    applying = true;
    SYNC_FIELDS.forEach(function (k) { if (d[k] !== undefined) P[k] = d[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {}
    P = load();
    try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {}
    applying = false;
    applyTheme();
  }
  function untouched() {
    return !P.wins && !P.losses && !P.draws && !P.coins && !P.campaign && P.owned.length <= starters().length && !Object.keys(P.levels || {}).length;
  }
  function setStatus(st) { account.status = st; account.onChange && account.onChange(account); }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }
  function push() {
    var c = KV_SB();
    if (!c || !account.user) return Promise.resolve(false);
    setStatus('syncing');
    return c.from('kv_profiles').upsert({ user_id: account.user.id, data: exportData(), updated_at: new Date().toISOString() })
      .then(function (r) {
        if (r.error) { setStatus('error'); return false; }
        P.dirty = false; P.cloudUser = account.user.id;
        try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {}
        setStatus('synced'); return true;
      }, function () { setStatus('error'); return false; });
  }
  function pull() {
    var c = KV_SB();
    if (!c || !account.user) return;
    setStatus('syncing');
    c.from('kv_profiles').select('data, updated_at').eq('user_id', account.user.id).maybeSingle().then(function (r) {
      if (r.error) return setStatus('error');
      var uid = account.user.id;
      if (!r.data) { P.cloudUser = uid; return push(); }                       // first sign-in anywhere: upload this phone
      if (P.cloudUser === uid && P.dirty) return push();                       // this phone has unsynced changes
      if (P.cloudUser === uid || untouched()) { importData(r.data.data); P.cloudUser = uid; P.dirty = false; save(); return setStatus('synced'); }
      // this phone has its own progress and the account already has a save: let the player choose
      var cloud = r.data.data;
      if (account.onConflict) account.onConflict({
        cloud: { cards: (cloud.owned || []).length, rating: cloud.rating, coins: cloud.coins, campaign: cloud.campaign || 0 },
        local: { cards: P.owned.length, rating: P.rating, coins: P.coins, campaign: P.campaign || 0 },
        useCloud: function () { importData(cloud); P.cloudUser = uid; P.dirty = false; save(); setStatus('synced'); },
        useLocal: function () { P.cloudUser = uid; push(); },
      });
    }, function () { setStatus('error'); });
  }
  function initAuth(onChange, onConflict) {
    account.onChange = onChange; account.onConflict = onConflict;
    var c = KV_SB();
    if (!c) return;
    c.auth.onAuthStateChange(function (event, session) {
      var u = session && session.user;
      var was = account.user && account.user.id;
      var md = (u && u.user_metadata) || {};
      account.user = u ? { id: u.id, email: u.email, username: md.username || '', name: md.username || md.full_name || md.name || '' } : null;
      if (!u) { setStatus('signed-out'); return; }
      if (was !== u.id) pull();
      // tidy the ?code=... left in the URL by the Google redirect
      if (/[?&]code=/.test(location.search)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    });
  }
  // Username + password accounts (no email needed). Usernames map to a private placeholder address.
  var USER_DOMAIN = '@players.kingsvendetta.app';
  function cleanUsername(u) { return String(u || '').trim().toLowerCase(); }
  function validUsername(u) { return /^[a-z0-9_]{3,16}$/.test(u); }
  function signInPassword(username, password, create) {
    var c = KV_SB(), u = cleanUsername(username);
    if (!c) return Promise.resolve({ error: 'Online features are not available.' });
    if (!validUsername(u)) return Promise.resolve({ error: 'Username: 3-16 letters, numbers or _' });
    if (!password || password.length < 6) return Promise.resolve({ error: 'Password: at least 6 characters' });
    var req = create
      ? c.auth.signUp({ email: u + USER_DOMAIN, password: password, options: { data: { username: u } } })
      : c.auth.signInWithPassword({ email: u + USER_DOMAIN, password: password });
    return req.then(function (r) {
      if (!r.error) return {};
      var m = r.error.message || '';
      if (/already registered|already been registered/i.test(m)) return { error: 'That username is taken.' };
      if (/invalid login/i.test(m)) return { error: 'Wrong username or password.' };
      return { error: m };
    }, function () { return { error: 'Could not reach the server.' }; });
  }

  function signInGoogle() {
    var c = KV_SB();
    if (!c) return Promise.resolve();
    return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  }
  function signOut() {
    var c = KV_SB();
    var done = function () { account.user = null; P.cloudUser = null; save(); setStatus('signed-out'); };
    return c ? (P.dirty ? push() : Promise.resolve()).then(function () { return c.auth.signOut(); }).then(done, done) : Promise.resolve(done());
  }

  // ---- shared leaderboard (Supabase RPCs; the table itself is locked) ----
  var sb = null;
  function client() {
    return KV_SB();
  }
  function syncLeaderboard(name) {
    var c = client();
    if (!c || !P.rankedGames) return Promise.resolve(false);
    rollSeason();
    return c.rpc('kv_submit', { p_client_id: P.clientId, p_secret: P.secret, p_name: (name || 'Player').slice(0, 16), p_rating: P.rating,
      p_wins: P.wins, p_losses: P.losses, p_draws: P.draws, p_ranked_games: P.rankedGames, p_season: P.season, p_season_games: P.seasonGames || 0 })
      .then(function (r) { return !r.error && r.data === true; }, function () { return false; });
  }
  // My global position (cached on the profile for the Mythic badge)
  function fetchRank() {
    var c = client();
    if (!c || !P.seasonGames) { P.rank = null; return Promise.resolve(null); }
    return c.rpc('kv_rank_season', { p_client_id: P.clientId, p_season: seasonId() }).then(function (r) {
      if (!r.error) { P.rank = r.data || null; save(); }
      return P.rank;
    }, function () { return P.rank; });
  }
  function myTier() { return tier(P.rating, P.rank); }
  function fetchLeaderboard() {
    var c = client();
    if (!c) return Promise.resolve([]);
    return c.rpc('kv_leaderboard_season', { p_season: seasonId(), p_limit: 100 }).then(function (r) { return r.error ? [] : r.data; }, function () { return []; });
  }

  return {
    get: function () { return P; }, seasonId: seasonId, seasonName: seasonName, seasonDaysLeft: seasonDaysLeft, claimSeasonReward: claimSeasonReward, account: function () { return account; }, initAuth: initAuth, signInPassword: signInPassword, signInGoogle: signInGoogle, signOut: signOut, syncNow: push, syncLeaderboard: syncLeaderboard, fetchRank: fetchRank, myTier: myTier, fetchLeaderboard: fetchLeaderboard, save: save, DECK_SIZE: DECK_SIZE, RARITY_LABEL: RARITY_LABEL, CHESTS: CHESTS, THEMES: THEMES,
    deckForGame: deckForGame, deckCode: deckCode, parseDeckCode: parseDeckCode, importDeck: importDeck, level: level, upgradeCost: upgradeCost, canUpgrade: canUpgrade, upgrade: upgrade,
    levelsForGame: levelsForGame, MAX_LEVEL: MAX_LEVEL, campaignWin: campaignWin, toggleDeck: toggleDeck, tier: tier, openChest: openChest, recordGame: recordGame,
    buyTheme: buyTheme, buyCosmetic: buyCosmetic, buyChest: buyChest, owns: owns, equipped: equipped, COSMETICS: COSMETICS, applyTheme: applyTheme, backupCode: backupCode, restore: restore, cards: cards,
  };
})();
