// Ranked bots: fill the ranked queue when no human is searching. Strength scales with Elo:
// higher rating = rarer cards, higher card levels, and a sharper (less random) AI.
var KV_BOTS = (function () {
  var NAMES = ['Sir Aldric', 'Lady Brienne', 'Baron Corvin', 'Dame Elowen', 'Lord Fenwick', 'Captain Garrick', 'Warden Hal',
    'Countess Isolde', 'Sir Jasper', 'Marshal Kael', 'Lady Lyra', 'Duke Merrick', 'Sir Osric', 'Lady Rowena', 'Thane Sigurd',
    'Sir Tristan', 'Lady Ysolde', 'Baron Wulfric'];

  function rarityWeights(r) {
    if (r < 1000) return { common: 70, uncommon: 30 };
    if (r < 1200) return { common: 40, uncommon: 40, rare: 20 };
    if (r < 1400) return { common: 20, uncommon: 35, rare: 30, epic: 15 };
    if (r < 1600) return { uncommon: 25, rare: 35, epic: 30, legendary: 10 };
    return { rare: 30, epic: 40, legendary: 30 };
  }
  function pickWeighted(w, rng) {
    var tot = 0, k; for (k in w) tot += w[k];
    var x = rng() * tot;
    for (k in w) { x -= w[k]; if (x < 0) return k; }
    return Object.keys(w)[0];
  }

  // Build a bot near `rating` (the player's), +/- 60
  function make(rating, rng) {
    rng = rng || Math.random;
    var r = Math.max(600, Math.round(rating + (rng() * 120 - 60)));
    var pool = KV_CARDS.filter(function (c) { return c.ready && c.key !== 'general' && !c.superRare; });
    var w = rarityWeights(r), deck = [], guard = 0;
    while (deck.length < 20 && guard++ < 500) {
      var rar = pickWeighted(w, rng);
      var opts = pool.filter(function (c) { return c.rarity === rar && deck.indexOf(c.key) < 0; });
      if (opts.length) deck.push(opts[Math.floor(rng() * opts.length)].key);
    }
    var levels = {};
    deck.forEach(function (k) {
      var x = rng();
      if (r >= 1600) levels[k] = x < 0.4 ? 3 : x < 0.8 ? 2 : 1;
      else if (r >= 1450) levels[k] = x < 0.15 ? 3 : x < 0.65 ? 2 : 1;
      else if (r >= 1250) levels[k] = x < 0.3 ? 2 : 1;
    });
    var noise = Math.max(0.4, Math.min(3.2, 3.2 - (r - 900) / 250));
    return { name: '🤖 ' + NAMES[Math.floor(rng() * NAMES.length)], rating: r, deck: deck, levels: levels, noise: noise, bot: true };
  }

  return { make: make };
})();
