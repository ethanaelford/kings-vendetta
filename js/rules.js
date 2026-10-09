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
  function cardDef(key) { return CARD_BY_KEY[key]; }

  // ---------- dice ----------
  function rollDie(rng) { return 1 + Math.floor((rng || Math.random)() * 6); }

  // Distribution of the raw roll for an attacker: {total: probability}
  function diceDist(attacker) {
    var d = {};
    if (ab(attacker).dice === 'oneDouble') {
      for (var a = 1; a <= 6; a++) d[a * 2] = (d[a * 2] || 0) + 1 / 6;
    } else {
      for (var x = 1; x <= 6; x++) for (var y = 1; y <= 6; y++) d[x + y] = (d[x + y] || 0) + 1 / 36;
    }
    return d;
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
    if (a.rollsRequired) card.rollsToKill = a.rollsRequired(card);
    if (a.isGeneral) card.isGeneral = true;
    return card;
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
  function dealTeam(side, rng) {
    var size = CFG.TEAM_SIZE || 12;
    var pool = shuffle(readyPool(), rng).slice(0, size - 1);
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
    var s = {
      v: 1, seq: 0, phase: 'deploy', turn: null, first: null, winner: null, turnCount: 0,
      names: opts.names || { p1: 'Player 1', p2: 'Player 2' },
      ready: { p1: false, p2: false },
      teams: { p1: dealTeam('p1', rng), p2: dealTeam('p2', rng) },
      graves: { p1: [], p2: [] },
      lastActor: { p1: null, p2: null },
      log: ['Cards dealt. Arrange your troops, then press Ready.'],
      lastEvent: { kind: 'deal' },
    };
    return s;
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

  function canTarget(attacker, target) {
    var a = ab(target);
    if (a.canBeTargetedBy && !a.canBeTargetedBy({ attacker: attacker, target: target })) return false;
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
    if (a.getTargets) {
      groups = a.getTargets({ state: state, card: card, index: f.index, col: colOf(f.index), row: rowOf(f.index), enemySlots: enemySlots });
    } else {
      if (rowOf(f.index) === 1 && FRONT_ONLY[def.pattern] && !a.anyRow) return [];
      groups = patternGroups(def.pattern, enemySlots, f.index, { lastEnemyActor: state.lastActor[other(side)] });
    }
    var byId = {};
    enemySlots.forEach(function (c) { if (c) byId[c.id] = c; });
    var out = [];
    groups.forEach(function (g) {
      var t = g.filter(function (id) { return byId[id] && canTarget(card, byId[id]); });
      if (t.length) out.push({ targets: t });
    });
    return out;
  }

  function legalActions(state, side) {
    var acts = [];
    state.teams[side].slots.forEach(function (c) {
      if (!c) return;
      getOptions(state, side, c.id).forEach(function (o, k) { acts.push({ cardId: c.id, option: k, targets: o.targets }); });
    });
    return acts;
  }

  // ---------- roll math ----------
  function rollModifier(state, attacker) {
    var m = 0, a = ab(attacker);
    if (a.modifyRoll) m += a.modifyRoll({ state: state, attacker: attacker });
    (attacker.statuses || []).forEach(function (st) { if (st.type === 'debuff') m -= st.n; if (st.type === 'buff') m += st.n; });
    return m;
  }

  function targetLife(state, target) {
    var l = target.life, a = ab(target);
    if (a.modifyTargetLife) l = a.modifyTargetLife({ state: state, target: target, life: l });
    (target.statuses || []).forEach(function (st) { if (st.type === 'armor') l += st.n || 1; });
    return l;
  }

  function isSuccess(attacker, target, raw, total, life) {
    var ta = ab(target), aa = ab(attacker);
    if (ta.onlyDiesTo === 'snakeEyes') return raw.length === 2 && raw[0] === 1 && raw[1] === 1;
    if (aa.successRule === 'under') return total < life;
    return total >= life;
  }

  // Exact chance one roll of `attacker` succeeds against `target`. Returns {p, need, text}
  function hitChance(state, attacker, target) {
    var mod = rollModifier(state, attacker), life = targetLife(state, target);
    var aa = ab(attacker), ta = ab(target);
    var p = 0, text;
    if (ta.onlyDiesTo === 'snakeEyes') {
      p = aa.dice === 'oneDouble' ? 0 : 1 / 36;
      text = 'Snake eyes only';
    } else {
      var d = diceDist(attacker);
      Object.keys(d).forEach(function (k) {
        var t = +k + mod;
        if (aa.successRule === 'under' ? t < life : t >= life) p += d[k];
      });
      var need = life - mod;
      text = aa.successRule === 'under' ? 'Need under ' + need : 'Need ' + need + '+';
    }
    var left = target.rollsToKill - target.hitsTaken;
    if (left > 1) text += ' (hit ' + (target.hitsTaken + 1) + ' of ' + target.rollsToKill + ')';
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
    var att = findCard(s, intent.cardId);
    var attacker = att.card, aa = ab(attacker);
    var attacks = aa.attacks || 1;
    var ev = { kind: 'attack', side: side, attackerId: attacker.id, attackerName: attacker.name, rolls: [], deaths: [], attackerDied: false, moves: { p1: [], p2: [] } };
    var deaths = ev.deaths;
    var alive = opt.targets.slice();

    for (var k = 0; k < attacks && alive.length && !ev.attackerDied; k++) {
      var raw = aa.dice === 'oneDouble' ? [rollDie(rng)] : [rollDie(rng), rollDie(rng)];
      var base = aa.dice === 'oneDouble' ? raw[0] * 2 : raw[0] + raw[1];
      var mod = rollModifier(s, attacker);
      var total = base + mod;
      var r = { dice: raw, base: base, mod: mod, total: total, hits: [] };
      var survivors = [];
      alive.forEach(function (id) {
        var tf = findCard(s, id);
        if (!tf) return;
        var t = tf.card, life = targetLife(s, t);
        var ok = isSuccess(attacker, t, raw, total, life);
        var killed = false;
        if (ok) {
          t.hitsTaken++;
          if (t.hitsTaken >= t.rollsToKill) { killed = true; killCard(s, tf, deaths); }
        } else if (generalRisk(attacker, t)) {
          ev.attackerDied = true;
        }
        if (!killed) survivors.push(id);
        r.hits.push({ id: id, name: t.name, life: life, success: ok, killed: killed, hitsTaken: t.hitsTaken, rollsToKill: t.rollsToKill });
      });
      ev.rolls.push(r);
      alive = survivors;
      var msg = attacker.name + ' rolls ' + total + (mod ? ' (' + base + (mod > 0 ? '+' : '') + mod + ')' : '') + ': ' +
        r.hits.map(function (h) { return h.name + (h.killed ? ' killed' : h.success ? ' hit (' + h.hitsTaken + '/' + h.rollsToKill + ')' : ' survives'); }).join(', ');
      log(s, s.names[side] + ' - ' + msg);
    }
    if (ev.attackerDied) {
      var af = findCard(s, attacker.id);
      if (af) killCard(s, af, deaths);
      log(s, attacker.name + ' failed against the General and dies!');
    }
    s.lastActor[side] = attacker.id;
    finishTurn(s, side, ev);
    return bump(s, ev);
  }

  function checkWin(s) {
    var g1 = generalOf(s, 'p1'), g2 = generalOf(s, 'p2');
    if (!g1 || !g2) {
      s.phase = 'over';
      s.winner = !g2 && g1 ? 'p1' : !g1 && g2 ? 'p2' : 'draw';
      log(s, s.winner === 'draw' ? 'Both Generals fell - draw!' : s.names[s.winner] + ' wins! The enemy General has fallen.');
      return true;
    }
    return false;
  }

  function finishTurn(s, side, ev) {
    SIDES.forEach(function (sd) {
      var res = compactBoard(s.teams[sd], CFG);
      s.teams[sd].slots = res.slots;
      ev.moves[sd] = res.moves;
    });
    if (checkWin(s)) return;
    s.turnCount++;
    s.turn = other(side);
    // auto-pass if the next player has no legal action
    for (var guard = 0; guard < 2; guard++) {
      if (legalActions(s, s.turn).length) return;
      log(s, s.names[s.turn] + ' has no legal attack and passes.');
      ev.passed = (ev.passed || []).concat(s.turn);
      s.turn = other(s.turn);
    }
    s.phase = 'over'; s.winner = 'draw';
    log(s, 'No one can attack - draw.');
  }

  var KV_RULES = {
    SIDES: SIDES, other: other, clone: clone, cardDef: cardDef, ab: ab, colOf: colOf, rowOf: rowOf,
    probAtLeast: probAtLeast, diceDist: diceDist, makeCard: makeCard, readyPool: readyPool, dealTeam: dealTeam,
    newGame: newGame, findCard: findCard, generalOf: generalOf, compactBoard: compactBoard,
    patternGroups: patternGroups, getOptions: getOptions, legalActions: legalActions,
    hitChance: hitChance, generalRisk: generalRisk, targetLife: targetLife,
    swap: swap, setReady: setReady, act: act, checkWin: checkWin,
  };
  root.KV_RULES = KV_RULES;
  if (isNode) module.exports = KV_RULES;
})(typeof window !== 'undefined' ? window : globalThis);
