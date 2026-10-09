// Daily quests: 3 new quests every day (same 3 for everyone that day), tracked on this device.
// Progress counts in online and vs-computer games (not pass & play).
var KV_QUESTS = (function () {
  var KEY = 'kv-quests';
  var POOL = [
    { id: 'play3',     text: 'Play 3 games',                                stat: 'games',     goal: 3,  coins: 40 },
    { id: 'win1',      text: 'Win a game',                                  stat: 'wins',      goal: 1,  coins: 50 },
    { id: 'win3',      text: 'Win 3 games',                                 stat: 'wins',      goal: 3,  coins: 120, chest: 'silver' },
    { id: 'kills10',   text: 'Kill 10 enemy cards',                         stat: 'kills',     goal: 10, coins: 50 },
    { id: 'kills25',   text: 'Kill 25 enemy cards',                         stat: 'kills',     goal: 25, coins: 100 },
    { id: 'multi',     text: 'Kill 2+ cards with a single attack',          stat: 'multikill', goal: 1,  coins: 60 },
    { id: 'slayer',    text: 'Kill an enemy General with a card of Life 5 or less', stat: 'slayer', goal: 1, coins: 120, chest: 'gold' },
    { id: 'genkill',   text: 'Win by killing the enemy General',            stat: 'genwins',   goal: 1,  coins: 60 },
    { id: 'wipe',      text: 'Win by wiping out every enemy card but the General', stat: 'wipewins', goal: 1, coins: 90 },
    { id: 'ranked',    text: 'Win a ranked match',                          stat: 'rankedwins', goal: 1, coins: 100, chest: 'silver' },
    { id: 'swap3',     text: 'Use the swap move 3 times',                   stat: 'swaps',     goal: 3,  coins: 30 },
    { id: 'bonus',     text: 'Get 2 bonus attacks',                         stat: 'bonus',     goal: 2,  coins: 50 },
    { id: 'survive',   text: 'Win without your General being attacked',    stat: 'untouched', goal: 1,  coins: 90 },
    { id: 'fast',      text: 'Win a game in 12 of your turns or fewer',     stat: 'fastwins',  goal: 1,  coins: 80 },
  ];
  var PER_DAY = 3;

  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function seeded(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

  function pick(day) {
    var rnd = seeded('kv-' + day), ids = POOL.map(function (q) { return q.id; }), out = [];
    while (out.length < PER_DAY) { var i = Math.floor(rnd() * ids.length); out.push(ids.splice(i, 1)[0]); }
    return out;
  }

  function load() {
    var q = null;
    try { q = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var day = today();
    if (!q || q.day !== day) q = { day: day, ids: pick(day), stats: {}, claimed: {} };
    return q;
  }
  var Q = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(Q)); } catch (e) {} }

  function list() {
    if (Q.day !== today()) { Q = load(); save(); }
    return Q.ids.map(function (id) {
      var d = POOL.filter(function (x) { return x.id === id; })[0];
      var have = Math.min(Q.stats[d.stat] || 0, d.goal);
      return { id: id, text: d.text, goal: d.goal, have: have, done: have >= d.goal, claimed: !!Q.claimed[id], coins: d.coins, chest: d.chest || null };
    });
  }

  function add(stat, n) {
    if (Q.day !== today()) { Q = load(); }
    Q.stats[stat] = (Q.stats[stat] || 0) + (n || 1);
    save();
  }

  // Returns {coins, chest} reward, or null
  function claim(id) {
    var q = list().filter(function (x) { return x.id === id; })[0];
    if (!q || !q.done || q.claimed) return null;
    Q.claimed[id] = Date.now(); save();
    var P = KV_PROFILE.get(); P.coins += q.coins; KV_PROFILE.save();
    return { coins: q.coins, chest: q.chest };
  }

  function readyToClaim() { return list().filter(function (q) { return q.done && !q.claimed; }).length; }

  // ---- game tracking (called by the UI for each new event) ----
  var game = null; // per-game scratch: {gameId, myTurns, genAttacked}
  function onEvent(state, ev, mySide) {
    if (!state || !ev) return;
    if (!game || game.gameId !== state.gameId) game = { gameId: state.gameId, myTurns: 0, genAttacked: false };
    if (ev.kind === 'attack' || ev.kind === 'move') {
      if (ev.side === mySide) {
        game.myTurns++;
        var killed = (ev.deaths || []).filter(function (d) { return d.side !== mySide; });
        if (killed.length) add('kills', killed.length);
        var rollKills = (ev.rolls || []).reduce(function (n, r) { return n + r.hits.filter(function (h) { return h.killed; }).length; }, 0);
        if (rollKills >= 2) add('multikill');
        if (ev.bonus) add('bonus');
        if (ev.kind === 'move' && ev.swap) add('swaps');
        (ev.rolls || []).forEach(function (r) {
          r.hits.forEach(function (h) { if (h.killed && h.isGeneral && (ev.attackerLife || 99) <= 5) add('slayer'); });
        });
      } else {
        (ev.rolls || []).forEach(function (r) { r.hits.forEach(function (h) { if (h.isGeneral) game.genAttacked = true; }); });
      }
    }
  }
  function onGameOver(state, mySide) {
    add('games');
    if (state.winner !== mySide) return;
    add('wins');
    if (state.winReason === 'wipe') add('wipewins'); else if (state.winReason !== 'time') add('genwins');
    if (state.ranked) add('rankedwins');
    if (game && game.gameId === state.gameId) {
      if (!game.genAttacked) add('untouched');
      if (game.myTurns <= 12) add('fastwins');
    }
  }

  return { list: list, claim: claim, readyToClaim: readyToClaim, onEvent: onEvent, onGameOver: onGameOver };
})();
