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

  function toggleDeck(key) {
    var i = P.deck.indexOf(key);
    if (i >= 0) P.deck.splice(i, 1);
    else if (P.owned.indexOf(key) >= 0 && P.deck.length < DECK_SIZE) P.deck.push(key);
    else return false;
    save(); return true;
  }

  function tier(r) {
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
        var locked = cards().filter(function (c) { return c.rarity === order[i] && P.owned.indexOf(c.key) < 0; });
        if (locked.length) {
          var c = locked[Math.floor(Math.random() * locked.length)];
          P.owned.push(c.key);
          if (P.deck.length < DECK_SIZE) P.deck.push(c.key);
          save();
          return { kind: 'card', key: c.key, name: c.name, rarity: c.rarity };
        }
      }
    }
    var coins = rand(ch.coins[0], ch.coins[1]);
    P.coins += coins; save();
    return { kind: 'coins', coins: coins };
  }

  // Called once per finished game. Returns {chest, elo} or null if this game was already counted.
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
      elo = { delta: delta, rating: P.rating, tier: tier(P.rating) };
    }
    save();
    return { chest: rollChest(info.won), elo: elo };
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
    var data = { owned: P.owned, deck: P.deck, coins: P.coins, rating: P.rating, wins: P.wins, losses: P.losses, draws: P.draws, themes: P.themes, theme: P.theme, rankedGames: P.rankedGames };
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

  return {
    get: function () { return P; }, save: save, DECK_SIZE: DECK_SIZE, RARITY_LABEL: RARITY_LABEL, CHESTS: CHESTS, THEMES: THEMES,
    deckForGame: deckForGame, toggleDeck: toggleDeck, tier: tier, openChest: openChest, recordGame: recordGame,
    buyTheme: buyTheme, applyTheme: applyTheme, backupCode: backupCode, restore: restore, cards: cards,
  };
})();
