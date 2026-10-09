// King's Vendetta rules engine. PURE: no DOM, no timers. Works in browser (<script>) and Node (require).
// Board: team.slots is an array of 12; 0-5 = front row (col 0..5), 6-11 = back row. null = empty.
// Enemy column i faces my column i.
(function (root) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var CFG = root.KV_CONFIG || (isNode ? require('../config.js') : {});
  var CARDS = root.KV_CARDS || (isNode ? require('./cards.data.js') : []);
  var ABIL = root.KV_ABILITIES || (isNode ? require('./abilities.js') : {});

  var SIDES = ['p1', 'p2'];
  var FRONT_ONLY = { los: 1, column: 1, quad: 1, forD: 1, lean: 1, L: 1, six: 1, ends: 1 };
  var CARD_BY_KEY = {};
  CARDS.forEach(function (c) { CARD_BY_KEY[c.key] = c; });

  function other(side) { return side === 'p1' ? 'p2' : 'p1'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function ab(card) { return (card && ABIL[card.cardKey]) || {}; }
  function colOf(i) { return i % 6; }
  function rowOf(i) { return i < 6 ? 0 : 1; }
  // Unknown keys (e.g. a newer build's card on an older client) get a plain LOS stub instead of crashing.
  function cardDef(key) {
    return CARD_BY_KEY[key] || { key: key, name: key, pattern: 'los', text: 'Reload the page to see this card.', life: null, ready: false, lifeRaw: '?' };
  }

  // ---------- dice ----------
  function rollDie(rng) { return 1 + Math.floor((rng || Math.random)() * 6); }

  var TWO = {}, BEST3 = {};
  (function () {
    var x, y;
    for (x = 1; x <= 6; x++) for (y = 1; y <= 6; y++) TWO[x + y] = (TWO[x + y] || 0) + 1 / 36;
    var keys = Object.keys(TWO).map(Number);
    keys.forEach(function (a) { keys.forEach(function (b) { keys.forEach(function (c) {
      var m = Math.max(a, b, c); BEST3[m] = (BEST3[m] || 0) + TWO[a] * TWO[b] * TWO[c];
    }); }); });
  })();

  // Distribution of the base roll (before modifiers) for an attacker: {total: probability}
  function diceDist(attacker, state) {
    var d = {}, kind = ab(attacker).dice;
    if (kind === 'oneDouble') {
      for (var a = 1; a <= 6; a++) d[a * 2] = (d[a * 2] || 0) + 1 / 6;
      return d;
    }
    if (kind === 'best3') return BEST3;
    if (kind === 'mob') {
      // best of 3, but not the value picked last time (falls back to it if all three match it)
      var keys = Object.keys(TWO).map(Number), prev = attacker.lastPick;
      keys.forEach(function (a) { keys.forEach(function (b) { keys.forEach(function (c) {
        var vals = [a, b, c].filter(function (v) { return v !== prev; });
        var pick = vals.length ? Math.max.apply(null, vals) : prev;
        d[pick] = (d[pick] || 0) + TWO[a] * TWO[b] * TWO[c];
      }); }); });
      return d;
    }
    if (kind === 'last' && state && state.lastRoll) { d[state.lastRoll.sum] = 1; return d; }
    if (kind === 'magma') {
      Object.keys(TWO).forEach(function (k) { var v = +k + Math.floor(+k / 3); d[v] = (d[v] || 0) + TWO[k]; });
      return d;
    }
    return TWO;
  }

  // Roll the attacker's dice: {raw:[faces], base:number}
  function rollFor(attacker, state, rng) {
    var kind = ab(attacker).dice, raw, base;
    if (kind === 'oneDouble') { raw = [rollDie(rng)]; return { raw: raw, base: raw[0] * 2 }; }
    if (kind === 'last' && state.lastRoll) return { raw: state.lastRoll.raw.slice(), base: state.lastRoll.sum, reused: true };
    if (kind === 'mob') {
      var rolls = [0, 1, 2].map(function () { return [rollDie(rng), rollDie(rng)]; });
      var okRolls = rolls.filter(function (q) { return q[0] + q[1] !== attacker.lastPick; });
      var pool = okRolls.length ? okRolls : rolls;
      var pick = pool.reduce(function (b, q) { return !b || q[0] + q[1] > b[0] + b[1] ? q : b; }, null);
      attacker.lastPick = pick[0] + pick[1];
      return { raw: pick, base: pick[0] + pick[1] };
    }
    if (kind === 'best3') {
      var best = null;
      for (var i = 0; i < 3; i++) { var r = [rollDie(rng), rollDie(rng)]; if (!best || r[0] + r[1] > best[0] + best[1]) best = r; }
      return { raw: best, base: best[0] + best[1] };
    }
    raw = [rollDie(rng), rollDie(rng)];
    base = raw[0] + raw[1];
    if (kind === 'magma') base += Math.floor(base / 3);
    return { raw: raw, base: base };
  }

  // P(2d6 >= n), exact
  function probAtLeast(n) {
    var c = 0;
    for (var x = 1; x <= 6; x++) for (var y = 1; y <= 6; y++) if (x + y >= n) c++;
    return c / 36;
  }

  // ---------- cards ----------
  var idCounter = 0;
  function makeCard(key, side, rng) {
    var def = cardDef(key);
    idCounter++;
    var id = side + '-' + key + '-' + Math.floor((rng || Math.random)() * 1e6).toString(36) + idCounter.toString(36);
    var card = {
      id: id, cardKey: key, name: def.name, side: side,
      life: def.life, baseLife: def.life, rollsToKill: 1, hitsTaken: 0,
      statuses: [], usesLeft: null, cooldowns: {},
    };
    var a = ABIL[key] || {};
    if (a.fixedLife) { card.life = card.baseLife = a.fixedLife; }
    if (a.rollsRequired) card.rollsToKill = a.rollsRequired(card);
    if (a.isGeneral) card.isGeneral = true;
    if (a.init) a.init(card);
    return card;
  }

  // Best empty slot for a new card: behind an existing front card first, else a new column (compaction tidies up).
  function emptySlot(slots) {
    for (var c = 0; c < 6; c++) if (slots[c] && !slots[c + 6]) return c + 6;
    for (var c2 = 0; c2 < 6; c2++) if (!slots[c2] && !slots[c2 + 6]) return c2;
    return -1;
  }

  // Ready cards never dealt to this side (not on the board, not in its graveyard).
  function deckFor(s, side) {
    var used = {};
    s.teams[side].slots.forEach(function (c) { if (c) used[c.cardKey] = 1; });
    s.graves[side].forEach(function (g) { used[g.cardKey] = 1; });
    return readyPool().filter(function (k) { return !used[k]; });
  }

  function readyPool() {
    return CARDS.filter(function (c) { return c.ready && c.key !== 'general'; }).map(function (c) { return c.key; });
  }

  function shuffle(arr, rng) {
    arr = arr.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor((rng || Math.random)() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // General + 11 distinct random ready cards. General starts at GENERAL_SLOT.
  // deck: optional list of card keys to draw from (a player's 20-card deck); falls back to the full ready pool
  function dealTeam(side, rng, deck) {
    var size = CFG.TEAM_SIZE || 12;
    var ready = readyPool(), src = ready;
    if (deck && deck.length) {
      src = deck.filter(function (k, i) { return ready.indexOf(k) >= 0 && deck.indexOf(k) === i; });
      if (src.length < size - 1) src = src.concat(shuffle(ready.filter(function (k) { return src.indexOf(k) < 0; }), rng).slice(0, size - 1 - src.length));
    }
    var pool = shuffle(src, rng).slice(0, size - 1);
    var slots = new Array(12).fill(null);
    var gSlot = CFG.GENERAL_SLOT == null ? 8 : CFG.GENERAL_SLOT;
    slots[gSlot] = makeCard('general', side, rng);
    var k = 0;
    for (var i = 0; i < 12 && k < pool.length; i++) {
      if (i === gSlot) continue;
      slots[i] = makeCard(pool[k++], side, rng);
    }
    return { slots: slots };
  }

  function newGame(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var decks = opts.decks || {};
    var s = {
      v: 1, seq: 0, phase: 'deploy',
      gameId: Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36),
      ranked: !!opts.ranked, decks: { p1: decks.p1 || null, p2: decks.p2 || null }, ratings: opts.ratings || {},
      clock: opts.clockMs ? { limit: opts.clockMs, p1: opts.clockMs, p2: opts.clockMs, turnStart: null } : null, turn: null, first: null, winner: null, turnCount: 0,
      names: opts.names || { p1: 'Player 1', p2: 'Player 2' },
      ready: { p1: false, p2: false },
      teams: { p1: dealTeam('p1', rng, decks.p1), p2: dealTeam('p2', rng, decks.p2) },
      graves: { p1: [], p2: [] },
      lastActor: { p1: null, p2: null },
      log: ['Cards dealt. Arrange your troops, then press Ready.'],
      lastEvent: { kind: 'deal' },
    };
    return s;
  }

  // Re-deal one side from a new deck (e.g. when the guest's deck arrives during deploy)
  function redeal(state, side, deck, rng) {
    if (state.phase !== 'deploy' || state.ready[side]) return null;
    var s = clone(state);
    s.decks[side] = deck;
    s.teams[side] = dealTeam(side, rng, deck);
    return bump(s, { kind: 'deal' });
  }

  // Chess clock ran out
  function timeout(state, side) {
    if (state.phase !== 'battle') return null;
    var s = clone(state);
    if (s.clock) s.clock[side] = 0;
    s.phase = 'over'; s.winner = other(side); s.winReason = 'time';
    log(s, s.names[side] + "'s clock ran out - " + s.names[s.winner] + ' wins on time!');
    return bump(s, { kind: 'timeout', side: side, deaths: [], moves: { p1: [], p2: [] } });
  }

  // ---------- board helpers ----------
  function findCard(state, id) {
    for (var si = 0; si < 2; si++) {
      var side = SIDES[si], slots = state.teams[side].slots;
      for (var i = 0; i < 12; i++) if (slots[i] && slots[i].id === id) return { side: side, index: i, card: slots[i] };
    }
    return null;
  }

  function generalOf(state, side) {
    var slots = state.teams[side].slots;
    for (var i = 0; i < 12; i++) if (slots[i] && slots[i].isGeneral) return slots[i];
    return null;
  }

  // Pure: returns { slots, moves:[{id,from,to}] }. Does not mutate team.
  function compactBoard(team, config) {
    config = config || CFG;
    var slots = team.slots.slice();
    var moves = [];
    var advance = config.ADVANCE_BACK_ROW !== false;
    var dir = config.COMPACT_DIRECTION || 'center';
    var c;
    if (advance) {
      for (c = 0; c < 6; c++) {
        if (!slots[c] && slots[c + 6]) {
          moves.push({ id: slots[c + 6].id, from: c + 6, to: c });
          slots[c] = slots[c + 6]; slots[c + 6] = null;
        }
      }
    }
    var cols = [];
    for (c = 0; c < 6; c++) if (slots[c] || slots[c + 6]) cols.push(c);
    var n = cols.length;
    var offset = dir === 'left' ? 0 : dir === 'right' ? 6 - n : Math.floor((6 - n) / 2);
    var out = new Array(12).fill(null);
    cols.forEach(function (from, k) {
      var to = offset + k;
      [0, 6].forEach(function (r) {
        var card = slots[from + r];
        if (!card) return;
        out[to + r] = card;
        if (to !== from) {
          // merge with an advance move for the same card
          var prior = moves.filter(function (m) { return m.id === card.id; })[0];
          if (prior) prior.to = to + r; else moves.push({ id: card.id, from: from + r, to: to + r });
        }
      });
    });
    return { slots: out, moves: moves };
  }

  // ---------- targeting ----------
  function losIndex(enemySlots, col) {
    if (col < 0 || col > 5) return -1;
    if (enemySlots[col]) return col;
    if (enemySlots[col + 6]) return col + 6;
    return -1;
  }

  function idsAt(enemySlots, idxs) {
    var out = [];
    idxs.forEach(function (i) { if (i >= 0 && i < 12 && enemySlots[i]) out.push(enemySlots[i].id); });
    return out;
  }

  // Raw pattern groups: arrays of enemy card ids. Pure function of the board.
  function patternGroups(pattern, enemySlots, myIndex, ctx) {
    var col = colOf(myIndex), groups = [], i, li;
    ctx = ctx || {};
    switch (pattern) {
      case 'los':
        li = losIndex(enemySlots, col);
        if (li >= 0) groups.push([enemySlots[li].id]);
        break;
      case 'any':
        for (i = 0; i < 12; i++) if (enemySlots[i]) groups.push([enemySlots[i].id]);
        break;
      case 'ends': {
        var front = [0, 1, 2, 3, 4, 5].filter(function (c) { return enemySlots[c]; });
        var row = front.length ? front : [6, 7, 8, 9, 10, 11].filter(function (c) { return enemySlots[c]; });
        if (row.length) {
          var g = [enemySlots[row[0]].id];
          if (row.length > 1) g.push(enemySlots[row[row.length - 1]].id);
          groups.push(g);
        }
        break;
      }
      case 'column': {
        var cg = idsAt(enemySlots, [col, col + 6]);
        if (cg.length) groups.push(cg);
        break;
      }
      case 'quad': {
        li = losIndex(enemySlots, col);
        if (li < 0) break;
        var shape = ctx.quadShape || CFG.QUAD_SHAPE || 'choose';
        var blocks = [];
        if (shape !== 'right') blocks.push([col - 1, col]);
        if (shape !== 'left') blocks.push([col, col + 1]);
        blocks.forEach(function (b) {
          if (b[0] < 0 || b[1] > 5) return;
          var q = idsAt(enemySlots, [b[0], b[1], b[0] + 6, b[1] + 6]);
          if (q.length) groups.push(q);
        });
        break;
      }
      case 'forD':
        [col - 1, col, col + 1].forEach(function (c) {
          var k = losIndex(enemySlots, c);
          if (k >= 0) groups.push([enemySlots[k].id]);
        });
        break;
      case 'lean': {
        li = losIndex(enemySlots, col);
        if (li < 0) break;
        var r0 = rowOf(li) * 6;
        var left = idsAt(enemySlots, [r0 + col - 1, r0 + col - 2].filter(function (x) { return x - r0 >= 0; }));
        var right = idsAt(enemySlots, [r0 + col + 1, r0 + col + 2].filter(function (x) { return x - r0 <= 5; }));
        if (left.length) groups.push(left);
        if (right.length) groups.push(right);
        break;
      }
      case 'L':
        [col - 1, col + 1].forEach(function (c) {
          if (c < 0 || c > 5) return;
          var lg = idsAt(enemySlots, [col, col + 6, c + 6]);
          if (lg.length) groups.push(lg);
        });
        break;
      case 'lema':
        if (ctx.lastEnemyActor) {
          for (i = 0; i < 12; i++) if (enemySlots[i] && enemySlots[i].id === ctx.lastEnemyActor) groups.push([enemySlots[i].id]);
        }
        break;
      case 'general':
        for (i = 0; i < 12; i++) if (enemySlots[i] && enemySlots[i].isGeneral) groups.push([enemySlots[i].id]);
        break;
      case 'six': {
        var sixIdx = [];
        [col - 1, col, col + 1].forEach(function (c) { if (c >= 0 && c <= 5) sixIdx.push(c, c + 6); });
        var sg = idsAt(enemySlots, sixIdx);
        if (sg.length) groups.push(sg);
        break;
      }
      case 'mirror':
        if (enemySlots[myIndex]) groups.push([enemySlots[myIndex].id]);
        break;
      default: // support, special: no direct attack
        break;
    }
    return groups;
  }

  // ---------- statuses ----------
  var STATUS_ICON = { frozen: '❄', debuff: '⬇', buff: '⬆', lifeSet: '♥', poison: '☠', mark: '◎', doom: '☄' };
  var BAD = { frozen: 1, debuff: 1, lifeSet: 1, poison: 1, mark: 1, doom: 1 };
  function addStatus(s, card, st) {
    if (!card) return false;
    if (BAD[st.type] && ab(card).immuneDebuffs) return false;
    st.born = s.turnCount; st.icon = STATUS_ICON[st.type] || '*';
    card.statuses = (card.statuses || []).filter(function (x) { return x.type !== st.type; });
    card.statuses.push(st);
    return true;
  }
  function hasStatus(card, type) { return (card.statuses || []).some(function (x) { return x.type === type; }); }
  // End of `side`'s turn: count down its cards' statuses and cooldowns (not ones created this turn).
  // Returns ids of cards destroyed by an expiring 'doom' (Dragon Tamer) whose source is still alive.
  function tickStatuses(s, side) {
    var destroyed = [];
    s.teams[side].slots.forEach(function (c) {
      if (!c) return;
      c.statuses = (c.statuses || []).filter(function (st) {
        if (st.born === s.turnCount) return true;
        if (st.type === 'poison') c.life = Math.max(2, c.life - (st.n || 1));
        st.turns--;
        if (st.turns <= 0 && st.type === 'doom' && findCard(s, st.src)) destroyed.push(c.id);
        return st.turns > 0;
      });
      if (c.bounty != null && --c.bounty <= 0) destroyed.push(c.id);
      Object.keys(c.cooldowns || {}).forEach(function (k) { if (c.cooldowns[k] > 0) c.cooldowns[k]--; });
    });
    return destroyed;
  }
  function neighbours(index) {
    var out = [], col = index % 6;
    if (col > 0) out.push(index - 1);
    if (col < 5) out.push(index + 1);
    out.push(index < 6 ? index + 6 : index - 6);
    return out;
  }

  // Bonuses from allies anywhere on the team (e.g. Ranged / Melee Expert): {life, dmg, hits, attacks}
  function teamBonus(state, card) {
    var b = { life: 0, dmg: 0, hits: 0, attacks: 0 };
    var f = card.side && state.teams[card.side] ? state.teams[card.side].slots : [];
    f.forEach(function (ally) {
      if (!ally || ally.id === card.id || !ab(ally).teamAura) return;
      var x = ab(ally).teamAura({ ally: ally, card: card }) || {};
      b.life += x.life || 0; b.dmg += x.dmg || 0; b.hits += x.hits || 0; b.attacks += x.attacks || 0;
    });
    return b;
  }
  function rollsNeeded(state, card) { return card.rollsToKill + teamBonus(state, card).hits; }

  function canTarget(attacker, target, targetSlots) {
    var a = ab(target);
    if (a.canBeTargetedBy && !a.canBeTargetedBy({ attacker: attacker, target: target })) return false;
    // allies that protect this target (e.g. General's Bodyguard)
    for (var i = 0; targetSlots && i < 12; i++) {
      var ally = targetSlots[i];
      if (ally && ally.id !== target.id && ab(ally).protects && ab(ally).protects({ ally: ally, target: target, attacker: attacker })) return false;
    }
    return true;
  }

  // Attack options for one of my cards: [{targets:[ids]}]
  function getOptions(state, side, cardId) {
    if (state.phase !== 'battle') return [];
    var f = findCard(state, cardId);
    if (!f || f.side !== side) return [];
    var card = f.card, def = cardDef(card.cardKey), a = ab(card);
    var enemySlots = state.teams[other(side)].slots;
    var groups;
    var ex = state.extra;
    if (ex && (ex.side !== side || ex.cardId !== cardId)) return [];
    if (hasStatus(card, 'frozen')) return [];
    var ctx = { state: state, card: card, index: f.index, col: colOf(f.index), row: rowOf(f.index), enemySlots: enemySlots,
      mySlots: state.teams[side].slots, patternGroups: patternGroups, losIndex: losIndex };
    if (a.noAttack) groups = [];
    else if (ex && ex.pattern) {
      groups = patternGroups(ex.pattern, enemySlots, f.index, {});
    } else if (a.getTargets) {
      groups = rowOf(f.index) === 1 && !a.anyRow ? [] : a.getTargets(ctx);
    } else {
      groups = rowOf(f.index) === 1 && FRONT_ONLY[def.pattern] && !a.anyRow ? [] :
        patternGroups(def.pattern, enemySlots, f.index, { lastEnemyActor: state.lastActor[other(side)] });
    }
    var byId = {};
    enemySlots.forEach(function (c) { if (c) byId[c.id] = c; });
    var out = [];
    groups.forEach(function (g) {
      var t = g.filter(function (id) { return byId[id] && canTarget(card, byId[id], enemySlots); });
      if (t.length) out.push({ targets: t });
    });
    if (a.extraOptions && !(ex && ex.pattern)) {
      a.extraOptions(ctx).forEach(function (o) {
        if (!o.own) {
          o.targets = o.targets.filter(function (id) { return byId[id] && canTarget(card, byId[id], enemySlots); });
          if (!o.targets.length) return;
        }
        out.push(o);
      });
    }
    return out;
  }

  function legalActions(state, side) {
    var acts = [];
    state.teams[side].slots.forEach(function (c) {
      if (!c) return;
      getOptions(state, side, c.id).forEach(function (o, k) { acts.push({ cardId: c.id, option: k, targets: o.targets, mode: o.mode || null, own: !!o.own }); });
    });
    return acts;
  }

  // ---------- roll math ----------
  function rollModifier(state, attacker, target) {
    var m = (attacker.dmg || 0) + (attacker.tmpBonus || 0) + teamBonus(state, attacker).dmg, a = ab(attacker);
    if (a.modifyRoll) m += a.modifyRoll({ state: state, attacker: attacker, target: target });
    // passive auras from allies (e.g. Neon Wisp)
    var mine = attacker.side && state.teams[attacker.side] ? state.teams[attacker.side].slots : [];
    var af = attacker.side && findCard(state, attacker.id);
    mine.forEach(function (ally, i) {
      if (ally && ab(ally).passiveAura) {
        var adj = af ? neighbours(af.index).indexOf(i) >= 0 : false;
        m += ab(ally).passiveAura({ state: state, ally: ally, attacker: attacker, target: target, adjacent: adj }) || 0;
      }
    });
    (attacker.statuses || []).forEach(function (st) { if (st.type === 'debuff') m -= st.n; if (st.type === 'buff') m += st.n; });
    return m;
  }

  function targetLife(state, target) {
    var l = target.life + teamBonus(state, target).life, a = ab(target);
    if (a.modifyTargetLife) l = a.modifyTargetLife({ state: state, target: target, life: l });
    var f = target.side && findCard(state, target.id);
    if (f) {
      var slots = state.teams[f.side].slots;
      neighbours(f.index).forEach(function (i) { var al = slots[i]; if (al && ab(al).lifeAura) l += ab(al).lifeAura({ ally: al, target: target }) || 0; });
    }
    (target.statuses || []).forEach(function (st) { if (st.type === 'armor') l += st.n || 1; if (st.type === 'lifeSet') l = st.n; });
    return l;
  }

  function isSuccess(attacker, target, raw, total, life) {
    var ta = ab(target), aa = ab(attacker);
    if (ta.onlyDiesTo === 'snakeEyes') return raw.length === 2 && raw[0] === 1 && raw[1] === 1;
    if (aa.autoKill && aa.autoKill({ attacker: attacker, target: target })) return true;
    if (aa.successRule === 'under') return total < life;
    if (aa.successRule === 'doubles') return raw.length === 2 && raw[0] === raw[1];
    if (aa.successRule === 'exact') return total === life;
    return total >= life;
  }

  // Exact chance one roll of `attacker` succeeds against `target`. Returns {p, need, text}
  function hitChance(state, attacker, target) {
    var mod = rollModifier(state, attacker, target), life = targetLife(state, target);
    var aa = ab(attacker), ta = ab(target);
    var p = 0, text;
    if (ta.onlyDiesTo === 'snakeEyes') {
      p = aa.dice === 'oneDouble' ? 0 : aa.dice === 'best3' ? 1 / 46656 : 1 / 36;
      if (aa.dice === 'last' && state.lastRoll) p = state.lastRoll.raw[0] === 1 && state.lastRoll.raw[1] === 1 ? 1 : 0;
      text = 'Snake eyes only';
    } else if (aa.customAction) {
      p = 1; text = aa.customText || 'Special';
    } else if (aa.autoKill && aa.autoKill({ attacker: attacker, target: target })) {
      p = 1; text = 'Auto-kill';
    } else if (aa.successRule === 'doubles') {
      p = 1 / 6; text = 'Need doubles';
    } else {
      var d = diceDist(attacker, state);
      Object.keys(d).forEach(function (k) {
        var t = +k + mod;
        if (aa.successRule === 'under' ? t < life : aa.successRule === 'exact' ? t === life : t >= life) p += d[k];
      });
      var need = life - mod;
      text = aa.successRule === 'under' ? 'Need under ' + need : aa.successRule === 'exact' ? 'Need exactly ' + need : 'Need ' + need + '+';
    }
    var need2 = rollsNeeded(state, target), left = need2 - target.hitsTaken;
    if (left > 1) text += ' (hit ' + (target.hitsTaken + 1) + ' of ' + need2 + ')';
    return { p: p, text: text };
  }

  function generalRisk(attacker, target) {
    return !!(target.isGeneral && !attacker.isGeneral);
  }

  // ---------- actions ----------
  function bump(state, ev) {
    state.seq = (state.seq || 0) + 1;
    ev.seq = state.seq;
    state.lastEvent = ev;
    return state;
  }

  function log(state, msg) {
    state.log.push(msg);
    if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
  }

  function swap(state, side, a, b) {
    if (state.phase !== 'deploy' || state.ready[side]) return null;
    if (a === b || a < 0 || b < 0 || a > 11 || b > 11) return null;
    var s = clone(state), sl = s.teams[side].slots;
    var t = sl[a]; sl[a] = sl[b]; sl[b] = t;
    return bump(s, { kind: 'swap', side: side });
  }

  function setReady(state, side, rng) {
    if (state.phase !== 'deploy') return null;
    var s = clone(state);
    s.ready[side] = true;
    var ev = { kind: 'ready', side: side };
    if (s.ready.p1 && s.ready.p2) {
      // compact in case a column was left empty during deploy
      SIDES.forEach(function (sd) { s.teams[sd].slots = compactBoard(s.teams[sd], CFG).slots; });
      s.phase = 'battle';
      s.first = (rng || Math.random)() < 0.5 ? 'p1' : 'p2';
      s.turn = s.first;
      log(s, 'Battle! ' + s.names[s.first] + ' goes first.');
      ev = { kind: 'start', first: s.first };
      autoPass(s, ev);
    }
    return bump(s, ev);
  }

  function killCard(s, f, deaths) {
    s.teams[f.side].slots[f.index] = null;
    s.graves[f.side].push({ cardKey: f.card.cardKey, name: f.card.name, id: f.card.id });
    deaths.push({ id: f.card.id, side: f.side, index: f.index });
  }

  // intent: {cardId, option (index) | targetId}
  function act(state, side, intent, rng) {
    if (state.phase !== 'battle' || state.turn !== side) return null;
    var opts = getOptions(state, side, intent.cardId);
    var opt = null;
    if (typeof intent.option === 'number') opt = opts[intent.option];
    if (!opt && intent.targetId) opt = opts.filter(function (o) { return o.targets.indexOf(intent.targetId) >= 0; })[0];
    if (!opt) return null;

    var s = clone(state);
    var wasExtra = s.extra; s.extra = null; s.pendingExtra = null;
    var att = findCard(s, intent.cardId);
    var attacker = att.card, aa = ab(attacker);
    var attacks = (aa.attacks || 1) + teamBonus(s, attacker).attacks;
    var ev = { kind: 'attack', side: side, attackerId: attacker.id, attackerName: attacker.name, rolls: [], deaths: [], attackerDied: false, moves: { p1: [], p2: [] }, notes: [] };
    if (wasExtra) ev.bonus = true;
    var deaths = ev.deaths;
    var alive = opt.targets.slice();
    if (aa.randomTarget && !opt.mode && alive.length > 1) alive = [alive[Math.floor((rng || Math.random)() * alive.length)]];
    var kills = 0;
    var doomed = {}; // attacker id -> reason (companions included)
    attacker.revealed = true;

    function kill(id) {
      var f = findCard(s, id);
      if (!f) return false;
      killCard(s, f, deaths);
      return true;
    }

    // One attacker vs a group of targets with one roll. Returns {r, kills, survivors}.
    function strike(atk, ids, raw, base, reused, powerless) {
      var A = powerless ? {} : ab(atk);
      var firstT = findCard(s, ids[0]);
      var mod = powerless ? 0 : rollModifier(s, atk, firstT && firstT.card);
      var r = { by: atk.id === attacker.id ? null : atk.name, dice: raw, base: base, mod: mod, total: base + mod, hits: [], reused: !!reused };
      var nk = 0, survivors = [];
      var plan = ids.map(function (id) {
        var tf = findCard(s, id);
        if (!tf) return null;
        var life = targetLife(s, tf.card);
        var tot = base + (powerless ? 0 : rollModifier(s, atk, tf.card));
        tf.card.lastTargetedTurn = s.turnCount;
        if (ab(tf.card).reflectOnExact && tot === life) return { id: id, life: life, ok: false, reflect: true };
        return { id: id, life: life, ok: powerless ? (ab(tf.card).onlyDiesTo ? isSuccess({}, tf.card, raw, tot, life) : tot >= life) : isSuccess(atk, tf.card, raw, tot, life) };
      }).filter(Boolean);
      if (A.allOrNothing && plan.some(function (x) { return !x.ok; })) plan.forEach(function (x) { x.ok = false; });
      plan.forEach(function (x) {
        var tf = findCard(s, x.id);
        if (!tf) return;
        var t = tf.card, killed = false, ta = ab(t), shielded = false;
        if (x.ok) {
          var ent = wardOf(s, t);
          if (ent) { ent.shieldUsed = true; shielded = true; x.ok = false; ev.notes.push(ent.name + '’s shield protects ' + t.name); }
        }
        if (x.ok) {
          t.hitsTaken++;
          if (t.hitsTaken >= rollsNeeded(s, t)) {
            killed = true; nk++;
            var tIndex = tf.index, tSide = tf.side;
            killCard(s, tf, deaths);
            if (A.onKill) A.onKill({ state: s, attacker: atk, target: t, index: tIndex, slots: s.teams[tSide].slots, addStatus: addStatus, ev: ev });
            if (ta.onKilled) {
              var res = ta.onKilled({ state: s, killer: atk, target: t, addStatus: addStatus, ev: ev });
              if (res === 'killerDies' && !atk.isGeneral) doomed[atk.id] = t.name + ' takes its killer down';
              if (res && res.kill) res.kill.forEach(function (id) {
                if (id === atk.id) doomed[atk.id] = 'is cursed by ' + t.name;
                else kill(id);
              });
            }
          }
        } else if (!shielded) {
          if (generalRisk(atk, t)) doomed[atk.id] = 'failed against the General';
          if (ta.onFailedAttackAgainstMe) ta.onFailedAttackAgainstMe({ state: s, attacker: atk, target: t, addStatus: addStatus, ev: ev });
        }
        if (x.reflect && !s.pendingExtra) {
          s.pendingExtra = { side: tf.side, cardId: t.id, reason: t.name + ' catches the blow and strikes back!' };
          ev.notes.push(t.name + ' reflects the attack!');
        }
        if (!killed) {
          survivors.push(x.id);
          if (ta.onSurvive && !doomed[atk.id]) ta.onSurvive({ state: s, attacker: atk, target: t, ev: ev });
        }
        r.hits.push({ id: x.id, name: t.name, life: x.life, success: x.ok, killed: killed, hitsTaken: t.hitsTaken, rollsToKill: t.rollsToKill });
      });
      ev.rolls.push(r);
      log(s, s.names[side] + ' - ' + atk.name + (reused ? ' reuses the last roll ' : ' rolls ') + r.total +
        (mod ? ' (' + base + (mod > 0 ? '+' : '') + mod + ')' : '') + ': ' +
        r.hits.map(function (h) { return h.name + (h.killed ? ' killed' : h.success ? ' hit (' + h.hitsTaken + '/' + h.rollsToKill + ')' : ' survives'); }).join(', '));
      return { r: r, kills: nk, survivors: survivors };
    }

    var noRoll = !!aa.customAction;
    if (aa.customAction && !opt.mode) {
      aa.customAction({ state: s, attacker: attacker, targets: alive.map(function (id) { return findCard(s, id).card; }), ev: ev, addStatus: addStatus });
    }
    if (opt.mode === 'swapAlly' || opt.mode === 'cleanse') {
      noRoll = true; ev.kind = 'move';
      var ally = findCard(s, alive[0]), me = findCard(s, attacker.id);
      if (opt.mode === 'swapAlly') {
        var sl = s.teams[side].slots, tmp = sl[me.index]; sl[me.index] = sl[ally.index]; sl[ally.index] = tmp;
        attacker.usesLeft = 0;
        ev.notes.push(attacker.name + ' switches places with ' + ally.card.name);
      } else {
        ally.card.statuses = (ally.card.statuses || []).filter(function (st) { return !BAD[st.type]; });
        ev.notes.push(attacker.name + ' cleanses ' + ally.card.name);
      }
      alive = [];
    }
    if (opt.mode === 'ninja' || opt.mode === 'eagle') {
      var meF = findCard(s, attacker.id), tF = findCard(s, alive[0]);
      if (opt.mode === 'ninja') {
        // move into the front slot of the target's column (switching with whoever is there)
        var mySl = s.teams[side].slots, dest = colOf(tF.index);
        var t2 = mySl[dest]; mySl[dest] = attacker; mySl[meF.index] = t2;
        ev.notes.push(attacker.name + ' dashes to column ' + (dest + 1));
      } else {
        // pull the target into my line of sight (it switches with the card there)
        var enSl = s.teams[other(side)].slots, losI = losIndex(enSl, colOf(meF.index));
        if (losI >= 0 && losI !== tF.index) { var t3 = enSl[losI]; enSl[losI] = enSl[tF.index]; enSl[tF.index] = t3; }
        attacker.usesLeft = 0;
        ev.notes.push(attacker.name + ' drags ' + tF.card.name + ' into its sights');
      }
    }
    if (opt.mode === 'charge') {
      noRoll = true; ev.kind = 'move';
      attacker.charges = (attacker.charges || 0) + 1;
      ev.notes.push(attacker.name + ' charges (' + attacker.charges + '/2)');
      alive = [];
    }
    if (opt.mode === 'summon') {
      noRoll = true; ev.kind = 'move';
      attacker.usesLeft = 0;
      var deck = deckFor(s, side), mySlots = s.teams[side].slots, called = [];
      for (var n = 0; n < 2 && deck.length; n++) {
        var spot = emptySlot(mySlots);
        if (spot < 0) break;
        var key = deck.splice(Math.floor((rng || Math.random)() * deck.length), 1)[0];
        mySlots[spot] = makeCard(key, side, rng);
        called.push(mySlots[spot].name);
      }
      ev.notes.push(attacker.name + ' calls in ' + (called.join(' and ') || 'nobody'));
      alive = [];
    }
    if (opt.mode === 'steal') {
      noRoll = true; ev.kind = 'move';
      var st = findCard(s, alive[0]), mine = s.teams[side].slots, sp = emptySlot(mine);
      if (st && sp >= 0) {
        s.teams[st.side].slots[st.index] = null;
        st.card.side = side;
        mine[sp] = st.card;
        ev.notes.push(attacker.name + ' recruits ' + st.card.name + ' from the enemy!');
      }
      alive = [];
    }
    if (opt.mode === 'wagonSwitch') {
      noRoll = true; ev.kind = 'move';
      var wf = findCard(s, attacker.id), wt = findCard(s, alive[0]);
      var es = s.teams[other(side)].slots, li = losIndex(es, colOf(wf.index));
      if (li >= 0 && wt) { var tmpw = es[li]; es[li] = es[wt.index]; es[wt.index] = tmpw; }
      ev.notes.push(attacker.name + ' shoves ' + wt.card.name + ' into a new position');
      alive = [];
    }
    if (opt.mode === 'manipulate') {
      noRoll = true; ev.kind = 'move';
      var mt = findCard(s, alive[0]);
      attacker.usesLeft = 0;
      s.pendingExtra = { side: other(side), cardId: mt.card.id, thenTurn: side, reason: attacker.name + ' forces ' + s.names[other(side)] + ' to use ' + mt.card.name + ' this turn' };
      ev.notes.push(attacker.name + ' manipulates ' + mt.card.name + '!');
      alive = [];
    }
    if (opt.mode === 'hailMary') {
      noRoll = true;
      var hm = [rollDie(rng), rollDie(rng)];
      s.lastRoll = { raw: hm.slice(), sum: hm[0] + hm[1] };
      var won = hm[0] + hm[1] === 7;
      ev.rolls.push({ dice: hm, base: hm[0] + hm[1], mod: 0, total: hm[0] + hm[1], hits: [{ id: alive[0], name: 'Hail Mary', life: 7, success: won, killed: won }] });
      var loser = won ? other(side) : side, g = generalOf(s, loser);
      if (g) killCard(s, findCard(s, g.id), deaths);
      ev.notes.push(won ? 'HAIL MARY! A 7 - the enemy General falls!' : 'Hail Mary missed - ' + s.names[side] + '’s General falls!');
      log(s, s.names[side] + ' - ' + attacker.name + ' Hail Mary rolls ' + (hm[0] + hm[1]) + (won ? ': WIN' : ': LOSE'));
      alive = [];
    }
    ev.notes.forEach(function (n) { log(s, s.names[side] + ' - ' + n); });

    // auto-chosen mode (e.g. Wolf Mounted Dwarf: attack twice or +2)
    if (aa.plan) {
      var pl = aa.plan({ state: s, attacker: attacker, targets: alive.map(function (id) { return findCard(s, id).card; }) });
      attacks = pl.attacks || attacks;
      attacker.tmpBonus = pl.bonus || 0;
      if (pl.note) ev.notes.push(pl.note);
    }

    var lastRaw = null, lastBase = 0;
    for (var k = 0; k < attacks && alive.length && !doomed[attacker.id] && !noRoll; k++) {
      var rolled = rollFor(attacker, s, rng);
      if (!rolled.reused) s.lastRoll = { raw: rolled.raw.slice(), sum: rolled.raw.length === 2 ? rolled.raw[0] + rolled.raw[1] : rolled.raw[0] * 2 };
      lastRaw = rolled.raw; lastBase = rolled.base;
      var res1 = strike(attacker, alive, rolled.raw, rolled.base, rolled.reused);
      kills += res1.kills;
      alive = res1.survivors;
    }
    attacker.tmpBonus = 0;

    // companions attack with the same roll (Commander, Captain, Admiral, ...)
    if (aa.companions && lastRaw && !noRoll) {
      var aIdx = findCard(s, attacker.id);
      var comp = aIdx ? aa.companions({ state: s, attacker: attacker, index: aIdx.index, slots: s.teams[side].slots, enemySlots: s.teams[other(side)].slots, patternGroups: patternGroups }) : [];
      comp.forEach(function (c) {
        var cf = findCard(s, c.cardId);
        if (!cf || !c.targets || !c.targets.length) return;
        var enemy = s.teams[other(side)].slots;
        var ids = c.targets.filter(function (id) { var tf = findCard(s, id); return tf && canTarget(cf.card, tf.card, enemy); });
        if (!ids.length) return;
        var rw = lastRaw, rb = lastBase;
        if (c.ownRoll) { rw = [rollDie(rng), rollDie(rng)]; rb = rw[0] + rw[1]; }
        var rc = strike(cf.card, ids, rw, rb, false, c.powerless);
        kills += rc.kills;
      });
    }

    if (!doomed[attacker.id] && aa.mustKill && kills < aa.mustKill) doomed[attacker.id] = 'needed ' + aa.mustKill + ' kills';
    if (aa.onAttackResolved) aa.onAttackResolved({ state: s, attacker: attacker, kills: kills, isExtra: !!wasExtra, ev: ev, targets: opt.targets, survivors: alive, addStatus: addStatus });
    (ev.extraKills || []).forEach(function (id) { kill(id); });
    if (doomed[attacker.id] || ev.selfDestruct) {
      ev.attackerDied = !!doomed[attacker.id];
      ev.dieReason = doomed[attacker.id];
      if (s.pendingExtra && s.pendingExtra.cardId === attacker.id) s.pendingExtra = null;
    }
    Object.keys(doomed).forEach(function (id) {
      var f = findCard(s, id);
      if (f) { log(s, f.card.name + ' ' + doomed[id] + ' and dies!'); killCard(s, f, deaths); }
    });
    if (ev.selfDestruct) kill(attacker.id);
    // Stone Golem: last card standing (besides the General) wipes the enemy formation, once
    SIDES.forEach(function (sd) {
      if (s.golemDone && s.golemDone[sd]) return;
      var mine = s.teams[sd].slots.filter(function (c) { return c && !c.isGeneral; });
      if (mine.length === 1 && ab(mine[0]).lastStandWipe && deaths.length) {
        s.golemDone = s.golemDone || {}; s.golemDone[sd] = true;
        s.teams[other(sd)].slots.forEach(function (c) { if (c && !c.isGeneral) kill(c.id); });
        ev.notes.push(mine[0].name + ' stands alone: the enemy formation crumbles!');
        log(s, mine[0].name + ' stands alone: the enemy formation crumbles!');
      }
    });
    // onAnyKill: survivors react to enemy deaths (e.g. Spartan)
    SIDES.forEach(function (sd) {
      var enemyDeaths = deaths.filter(function (d) { return d.side !== sd; }).length;
      if (!enemyDeaths) return;
      s.teams[sd].slots.forEach(function (c) {
        if (c && ab(c).onAnyKill) ab(c).onAnyKill({ state: s, card: c, count: enemyDeaths });
      });
    });
    if (attacker.isGeneral && kills && s.guardPending && s.guardPending[side]) {
      var gs = s.teams[side].slots, gsp = emptySlot(gs);
      if (gsp >= 0) {
        gs[gsp] = makeCard(s.guardPending[side].key, side, rng);
        s.graves[side] = s.graves[side].filter(function (g) { return g.cardKey !== s.guardPending[side].key; });
        ev.notes.push("The General avenges his Guard - General's Guard returns!");
        log(s, "General's Guard is resurrected!");
        delete s.guardPending[side];
      }
    }
    s.lastActor[side] = attacker.id;
    finishTurn(s, side, ev, wasExtra);
    return bump(s, ev);
  }

  // Ent: shields one neighbouring ally (General first, else highest Life) from one successful hit.
  function wardOf(s, target) {
    var f = findCard(s, target.id);
    if (!f) return null;
    var slots = s.teams[f.side].slots, found = null;
    neighbours(f.index).forEach(function (i) {
      var e = slots[i];
      if (!e || found || !ab(e).shieldsNeighbour || e.shieldUsed) return;
      var best = null;
      neighbours(i).forEach(function (j) {
        var c = slots[j];
        if (!c) return;
        if (!best || (c.isGeneral && !best.isGeneral) || (!best.isGeneral && c.life > best.life)) best = c;
      });
      if (best && best.id === target.id) found = e;
    });
    return found;
  }

  // Skip an optional bonus attack.
  function skip(state, side) {
    if (state.phase !== 'battle' || !state.extra || state.extra.side !== side) return null;
    var s = clone(state);
    var ex = s.extra; s.extra = null;
    log(s, s.names[side] + ' skips the bonus attack.');
    var ev = { kind: 'skip', side: side, deaths: [], moves: { p1: [], p2: [] } };
    s.turn = ex.thenTurn;
    autoPass(s, ev);
    return bump(s, ev);
  }

  // A side loses when its General dies, or (WIN_BY_WIPE) when only its General is left.
  function lossReason(s, side) {
    if (!generalOf(s, side)) return 'general';
    if (CFG.WIN_BY_WIPE !== false && !s.teams[side].slots.some(function (c) { return c && !c.isGeneral; })) return 'wipe';
    return null;
  }

  function checkWin(s, actor) {
    var l1 = lossReason(s, 'p1'), l2 = lossReason(s, 'p2');
    if (!l1 && !l2) return false;
    s.phase = 'over';
    if (l1 && l2) {
      // both Generals dead = draw; otherwise whoever just acted takes it
      s.winner = l1 === 'general' && l2 === 'general' ? 'draw' : actor || 'draw';
    } else s.winner = l1 ? 'p2' : 'p1';
    var why = (s.winner === 'p1' ? l2 : l1) === 'wipe' ? 'The enemy army is wiped out - only their General remains.' : 'The enemy General has fallen.';
    s.winReason = s.winner === 'draw' ? 'draw' : (s.winner === 'p1' ? l2 : l1);
    log(s, s.winner === 'draw' ? 'Both Generals fell - draw!' : s.names[s.winner] + ' wins! ' + why);
    return true;
  }

  function canSwap(s, side) {
    if (CFG.TURN_SWAP === 'off' || s.extra) return false;
    return s.teams[side].slots.filter(Boolean).length >= 2;
  }

  // Battle swap: instead of attacking, switch two of your own cards (uses the turn).
  // TURN_SWAP: 'any' = any two of your cards, 'adjacent' = neighbours only, 'off'.
  function turnSwap(state, side, a, b) {
    if (state.phase !== 'battle' || state.turn !== side || !canSwap(state, side)) return null;
    if (a === b || a < 0 || b < 0 || a > 11 || b > 11) return null;
    var sl = state.teams[side].slots;
    if (!sl[a] || !sl[b]) return null;
    if (CFG.TURN_SWAP === 'adjacent' && neighbours(a).indexOf(b) < 0) return null;
    var s = clone(state);
    var t = s.teams[side].slots;
    var ca = t[a], cb = t[b];
    t[a] = cb; t[b] = ca;
    var ev = { kind: 'move', side: side, rolls: [], deaths: [], moves: { p1: [], p2: [] }, notes: [ca.name + ' and ' + cb.name + ' switch places'] };
    log(s, s.names[side] + ' - ' + ev.notes[0]);
    s.lastActor[side] = ca.id;
    finishTurn(s, side, ev, null);
    return bump(s, ev);
  }

  function autoPass(s, ev) {
    for (var guard = 0; guard < 4; guard++) {
      if (legalActions(s, s.turn).length || canSwap(s, s.turn)) return;
      if (s.extra) { s.turn = s.extra.thenTurn; s.extra = null; continue; }
      log(s, s.names[s.turn] + ' has no legal move and passes.');
      ev.passed = (ev.passed || []).concat(s.turn);
      s.turn = other(s.turn);
    }
    s.phase = 'over'; s.winner = 'draw';
    log(s, 'No one can attack - draw.');
  }

  function finishTurn(s, side, ev, wasExtra) {
    tickStatuses(s, side).forEach(function (id) {
      var f = findCard(s, id);
      if (f) { killCard(s, f, ev.deaths); log(s, f.card.name + ' is destroyed!'); (ev.notes = ev.notes || []).push(f.card.name + ' is destroyed!'); }
    });
    // General's Guard: the General's window to earn the resurrection runs down
    if (s.guardPending && s.guardPending[side] && --s.guardPending[side].turns <= 0) {
      log(s, s.names[side] + "'s General's Guard stays in the grave.");
      delete s.guardPending[side];
    }
    SIDES.forEach(function (sd) {
      var res = compactBoard(s.teams[sd], CFG);
      s.teams[sd].slots = res.slots;
      ev.moves[sd] = res.moves;
    });
    if (checkWin(s, side)) return;
    s.turnCount++;
    s.quietTurns = ev.deaths && ev.deaths.length ? 0 : (s.quietTurns || 0) + 1;
    if (s.quietTurns >= (CFG.STALEMATE_TURNS || 30)) {
      s.phase = 'over'; s.winner = 'draw';
      log(s, 'Stalemate: ' + s.quietTurns + ' turns without a kill - draw.');
      return;
    }
    var next = wasExtra ? wasExtra.thenTurn : other(side);
    var pe = s.pendingExtra; s.pendingExtra = null;
    if (pe && findCard(s, pe.cardId)) {
      s.extra = { side: pe.side, cardId: pe.cardId, pattern: pe.pattern || null, reason: pe.reason, thenTurn: pe.thenTurn || next };
      s.turn = pe.side;
      ev.extra = s.extra;
      log(s, pe.reason);
    } else {
      s.turn = next;
    }
    autoPass(s, ev);
  }

  var KV_RULES = {
    SIDES: SIDES, other: other, clone: clone, cardDef: cardDef, ab: ab, colOf: colOf, rowOf: rowOf,
    probAtLeast: probAtLeast, diceDist: diceDist, makeCard: makeCard, readyPool: readyPool, dealTeam: dealTeam,
    newGame: newGame, findCard: findCard, generalOf: generalOf, compactBoard: compactBoard,
    patternGroups: patternGroups, getOptions: getOptions, legalActions: legalActions,
    hitChance: hitChance, generalRisk: generalRisk, targetLife: targetLife,
    swap: swap, setReady: setReady, act: act, skip: skip, redeal: redeal, timeout: timeout, turnSwap: turnSwap, canSwap: canSwap, lossReason: lossReason, emptySlot: emptySlot, deckFor: deckFor, rollsNeeded: rollsNeeded, teamBonus: teamBonus, losIndex: losIndex, checkWin: checkWin, addStatus: addStatus, hasStatus: hasStatus, neighbours: neighbours,
  };
  root.KV_RULES = KV_RULES;
  if (isNode) module.exports = KV_RULES;
})(typeof window !== 'undefined' ? window : globalThis);
