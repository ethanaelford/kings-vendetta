// UI: rendering, input, animations, game modes (ai / hotseat / host / guest).
(function () {
  'use strict';
  var R = KV_RULES, C = KV_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pct(p) { return (Math.round(p * 1000) / 10) + '%'; }

  // ---------------- controller state ----------------
  var G = {
    mode: null,        // 'ai' | 'hotseat' | 'host' | 'guest'
    room: null,
    state: null,
    view: 'p1',        // side shown at the bottom
    sel: null,         // selected own card id
    chosen: null,      // { opt, targetId }
    animating: false,
    oppPresent: false,
    netStatus: 'idle',
    shownSeq: -1,
  };
  var queue = Promise.resolve();
  var els = {};        // card id -> element
  var L = {};          // layout metrics

  function mySide() { return G.mode === 'guest' ? 'p2' : G.mode === 'hotseat' ? G.view : 'p1'; }
  function oppName() { return G.state ? G.state.names[R.other(G.view)] : 'Opponent'; }
  function myTurn() {
    var s = G.state;
    return s && s.phase === 'battle' && s.turn === G.view && (G.mode !== 'ai' || G.view === 'p1');
  }
  function myName() { return ($('nameInput').value || '').trim() || 'Player'; }

  // ---------------- screens ----------------
  function show(id) {
    ['lobby', 'game', 'library', 'collection', 'profile', 'leaders'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    if (id === 'game') { layout(); requestWake(); }
  }

  // ---------------- layout ----------------
  function layout() {
    var wrap = $('boardWrap');
    var gap = 4, midH = 54, frontGap = 6;
    var availW = Math.min(wrap.clientWidth - 12, 560);
    var availH = wrap.clientHeight - 8;
    var cw = Math.floor((availW - gap * 5) / 6);
    var ch = Math.round(cw * 1.36);
    var needH = 4 * ch + 2 * gap + 2 * frontGap + midH;
    if (needH > availH && availH > 200) {
      ch = Math.floor((availH - 2 * gap - 2 * frontGap - midH) / 4);
      cw = Math.min(cw, Math.floor(ch / 1.36));
    }
    var W = cw * 6 + gap * 5;
    var Y = [0, ch + gap, 2 * ch + gap + frontGap * 2 + midH, 3 * ch + 2 * gap + frontGap * 2 + midH];
    L = { cw: cw, ch: ch, gap: gap, Y: Y, W: W, H: Y[3] + ch, midTop: 2 * ch + gap + frontGap, midH: midH };
    var b = $('board');
    b.style.width = W + 'px'; b.style.height = L.H + 'px';
    document.documentElement.style.setProperty('--cw', cw + 'px');
    document.documentElement.style.setProperty('--ch', ch + 'px');
    var mid = $('mid'); mid.style.top = L.midTop + 'px'; mid.style.height = midH + 'px';
    Object.keys(els).forEach(function (id) { placeEl(id, false); });
  }

  function posFor(side, index) {
    var row = index < 6 ? 0 : 1, col = index % 6;
    var x = col * (L.cw + L.gap);
    var y = side === G.view ? (row === 0 ? L.Y[2] : L.Y[3]) : (row === 0 ? L.Y[1] : L.Y[0]);
    return 'translate(' + x + 'px,' + y + 'px)';
  }

  function placeEl(id) {
    var f = G.state && R.findCard(G.state, id);
    var el = els[id];
    if (!f || !el) return;
    var p = posFor(f.side, f.index);
    el.style.transform = p;
    el.style.setProperty('--pos', p);
  }

  // ---------------- card rendering ----------------
  function shownKey(card) {
    var f = G.state && R.findCard(G.state, card.id);
    if (card.cardKey === 'spy' && !card.revealed && f && f.side !== G.view && G.mode !== 'hotseat') return 'militia';
    return card.cardKey;
  }

  function cardInner(card) {
    var def = R.cardDef(shownKey(card));
    var h = '<div class="art">' + KV_ART.html(def) + '</div>';
    h += '<div class="life">' + (R.ab(card).lifeLabel || card.life) + '</div>';
    if (card.charges) h += '<div class="dmg" style="top:40px">⚡' + card.charges + '/2</div>';
    if (card.bounty != null) h += '<div class="dmg" style="top:40px;background:#7a5a2f">⏳' + card.bounty + '</div>';
    h += '<div class="pat">' + (KV_ART.PATTERN_ICON[def.pattern] || '') + '</div>';
    if (card.rollsToKill > 1) {
      h += '<div class="pips">';
      for (var i = 0; i < card.rollsToKill; i++) h += '<i class="' + (i < card.hitsTaken ? 'hit' : '') + '"></i>';
      h += '</div>';
    }
    if (card.dmg) h += '<div class="dmg">+' + card.dmg + '</div>';
    if (card.statuses && card.statuses.length) h += '<div class="st">' + card.statuses.map(function (s) { return s.icon || '•'; }).join('') + '</div>';
    h += '<div class="nm">' + esc(shortName(def.name)) + '</div>';
    return h;
  }

  function shortName(n) {
    var map = { 'Heavily Armored Soldier': 'Heavy Soldier', 'Stationary Crossbow Soldier': 'Crossbow', 'Berserker Warrior': 'Berserker',
      'Stealth Warrior': 'Stealth', 'Armored Warrior': 'Armored', 'Front Lineman': 'Lineman', 'Blade Dancer': 'Blade Dancer' };
    return map[n] || n;
  }

  function renderBoard(opts) {
    opts = opts || {};
    var s = G.state;
    var board = $('board');
    var seen = {};
    var showEnemy = s.phase !== 'deploy';
    var targetIds = {}, chosenIds = {}, actable = {};
    var selOpts = [];
    if (s.phase === 'battle' && myTurn() && !G.animating) {
      R.legalActions(s, G.view).forEach(function (a) { actable[a.cardId] = true; });
      if (G.sel) {
        selOpts = R.getOptions(s, G.view, G.sel);
        selOpts.forEach(function (o) { if (!o.self) o.targets.forEach(function (t) { targetIds[t] = true; }); });
        if (G.chosen && selOpts[G.chosen.opt]) selOpts[G.chosen.opt].targets.forEach(function (t) { chosenIds[t] = true; });
      }
    }
    var selCard = G.sel && R.findCard(s, G.sel);
    R.SIDES.forEach(function (side) {
      if (side !== G.view && !showEnemy) return;
      s.teams[side].slots.forEach(function (card, i) {
        if (!card) return;
        seen[card.id] = true;
        var el = els[card.id];
        var fresh = !el;
        if (fresh) {
          el = document.createElement('div');
          el.className = 'card';
          el.dataset.id = card.id;
          board.appendChild(el);
          els[card.id] = el;
        }
        var sig = shownKey(card) + '|' + card.charges + '|' + card.bounty + '|' + card.life + '|' + card.hitsTaken + '|' + (card.dmg || 0) + '|' + JSON.stringify(card.statuses);
        if (el._sig !== sig) { el.innerHTML = cardInner(card); el._sig = sig; }
        var cls = 'card ' + (side === G.view ? 'mine' : 'enemy') + ' rar-' + (R.cardDef(shownKey(card)).rarity || 'common');
        if (card.isGeneral) cls += ' general';
        if (G.sel === card.id) cls += ' sel';
        if (actable[card.id] && G.sel !== card.id) cls += ' can-act';
        if (targetIds[card.id]) cls += ' target';
        if (chosenIds[card.id]) cls += ' chosen';
        if (s.phase === 'battle' && side === G.view && myTurn() && !actable[card.id]) cls += ' dim';
        el.className = cls;
        var old = el.querySelector('.odds'); if (old) old.remove();
        if (targetIds[card.id] && selCard) {
          var mo = selOpts.filter(function (o) { return o.targets.indexOf(card.id) >= 0; })[0] || {};
          var d = document.createElement('div'); d.className = 'odds';
          d.textContent = mo.own || /hailMary|manipulate|steal|wagonSwitch/.test(mo.mode || '') ? mo.label : pct(R.hitChance(s, selCard.card, card).p);
          el.appendChild(d);
        }
        if (fresh && opts.dropEnemy && side !== G.view) {
          el.style.transition = 'none';
          var p0 = posFor(side, i).replace(/,([-\d.]+)px\)/, function (m, y) { return ',' + (+y - 420) + 'px)'; });
          el.style.transform = p0;
          void el.offsetWidth;
          el.style.transition = '';
          el.classList.add('drop');
          setTimeout(function () { el.classList.remove('drop'); }, 900);
        }
        var p = posFor(side, i);
        el.style.transform = p; el.style.setProperty('--pos', p);
      });
    });
    Object.keys(els).forEach(function (id) { if (!seen[id]) { els[id].remove(); delete els[id]; } });
    if (s.phase === 'deploy') {
      $('rollText').textContent = s.ready[R.other(G.view)] ? oppName() + ' is ready' : oppName() + ' is deploying…';
      $('rollText').className = '';
      $('die1').classList.add('hidden2'); $('die2').classList.add('hidden2');
    }
  }

  function renderBars() {
    var s = G.state, ban = $('banner'), bar = $('actionbar');
    if (!s) return;
    var opp = oppName();
    if (s.phase === 'deploy') {
      ban.className = 'banner deploy';
      ban.textContent = G.mode === 'hotseat' ? s.names[G.view] + ': deploy' : 'Deploy your army';
    } else if (s.phase === 'battle') {
      var mine = myTurn();
      ban.className = 'banner ' + (mine ? 'mine' : 'theirs');
      ban.textContent = mine ? (s.extra ? (s.extra.thenTurn !== s.extra.side ? 'Manipulated!' : 'Bonus attack!') : G.mode === 'hotseat' ? s.names[G.view] + ': your turn' : 'Your turn') : opp + (s.extra ? "'s bonus attack…" : "'s turn…");
    } else {
      ban.className = 'banner deploy';
      ban.textContent = s.winner === 'draw' ? 'Draw' : (s.winner === G.view || G.mode === 'hotseat' ? s.names[s.winner] + ' wins!' : opp + ' wins');
    }

    var h = '';
    if (s.phase === 'deploy') {
      if (s.ready[G.view]) {
        h = '<div class="info">Ready! Waiting for <b>' + esc(opp) + '</b> to deploy…</div>';
      } else if (G.sel) {
        var sc = R.findCard(s, G.sel);
        h = '<div class="info"><b>' + esc(sc.card.name) + '</b> selected. Tap another card to swap.</div>' +
          '<button class="btn" data-act="info">ⓘ</button>';
      } else {
        h = '<div class="info">Tap two cards to swap places. Keep your <b>General ♛</b> safe.</div>' +
          '<button class="btn primary" data-act="ready">Ready ✓</button>';
      }
    } else if (s.phase === 'battle') {
      if (!myTurn()) {
        h = '<div class="info">' + esc(opp) + ' is choosing an attack…</div><button class="btn" data-act="log">Log</button>';
      } else if (s.extra && !G.sel) {
        h = '<div class="info"><b>' + esc(s.extra.reason || 'Bonus attack') + '</b><br>Tap the glowing card, or skip.</div>' +
          '<button class="btn" data-act="skip">Skip</button>';
      } else if (!G.sel) {
        h = '<div class="info">Tap one of your <b>glowing</b> cards to attack with it.</div>';
      } else {
        var a = R.findCard(s, G.sel).card, def = R.cardDef(a.cardKey);
        var swapBtn = R.canSwap(s, G.view) ? '<button class="btn" data-act="swapmode">⇄ Swap</button>' : '';
        if (G.swapMode) {
          bar.innerHTML = '<div class="info"><b>⇄ Swap ' + esc(a.name) + '</b>: tap the card to switch places with (uses your turn).</div>' +
            '<button class="btn" data-act="swapcancel">Cancel</button>';
          return;
        }
        var opts = R.getOptions(s, G.view, G.sel);
        if (!opts.length) {
          h = '<div class="info"><b>' + esc(a.name) + '</b> has no targets from here.</div>' + swapBtn + '<button class="btn" data-act="info">ⓘ</button>';
        } else if (!G.chosen) {
          var selfBtns = '', onlySelf = true;
          opts.forEach(function (o, k) {
            if (o.self) selfBtns += '<button class="btn primary" data-act="self" data-opt="' + k + '">' + esc(o.label) + '</button>';
            else onlySelf = false;
          });
          h = '<div class="info"><b>' + esc(a.name) + '</b> ' + KV_ART.PATTERN_ICON[def.pattern] + ' ' + esc(KV_ART.PATTERN_TEXT[def.pattern]) +
            (onlySelf ? '' : '<br>Tap a red target.') + '</div>' + selfBtns + swapBtn + '<button class="btn" data-act="info">ⓘ</button>';
        } else {
          var opt = opts[G.chosen.opt];
          if (opt.own) {
            var ally = R.findCard(s, opt.targets[0]).card;
            h = '<div class="info"><b>' + esc(a.name) + '</b>: ' + esc(opt.label) + ' with <b>' + esc(ally.name) + '</b> (uses your turn)</div>' +
              '<button class="btn primary" data-act="attack">' + esc(opt.label.toUpperCase()) + '</button>';
            bar.innerHTML = h; return;
          }
          if (opt.mode === 'steal' || opt.mode === 'wagonSwitch') {
            var tt = R.findCard(s, opt.targets[0]).card;
            h = '<div class="info"><b>' + esc(a.name) + '</b>: ' + (opt.mode === 'steal' ? 'recruit <b>' + esc(tt.name) + '</b> onto your side' :
              'switch <b>' + esc(tt.name) + '</b> into your line of sight') + ' (uses your turn)</div>' +
              '<button class="btn primary" data-act="attack">' + esc(opt.label.toUpperCase()) + '</button>';
            bar.innerHTML = h; return;
          }
          if (opt.mode === 'manipulate') {
            var mv = R.findCard(s, opt.targets[0]).card;
            h = '<div class="info"><b>' + esc(a.name) + '</b> (once per game): ' + esc(opp) + ' must use <b>' + esc(mv.name) +
              '</b> on their next turn, or lose the turn.</div><button class="btn primary" data-act="attack">MANIPULATE</button>';
            bar.innerHTML = h; return;
          }
          if (opt.mode === 'hailMary') {
            h = '<div class="info"><b>HAIL MARY</b>: roll exactly <b>7</b> (16.7%) and you <b>win the game</b>.<br>' +
              '<span class="risk">⚠ Any other roll and YOU LOSE the game.</span></div>' +
              '<button class="btn danger" data-act="attack">GAMBLE</button>';
            bar.innerHTML = h; return;
          }
          var lines = opt.targets.map(function (id) {
            var t = R.findCard(s, id).card, hc = R.hitChance(s, a, t);
            return esc(t.name) + ': ' + hc.text + ' → <b>' + pct(hc.p) + '</b>';
          });
          var risk = opt.targets.some(function (id) { return R.generalRisk(a, R.findCard(s, id).card); });
          var extra = (R.ab(a).attacks || 1) > 1 ? ' (attacks ' + R.ab(a).attacks + '×)' : '';
          var modeTxt = opt.mode === 'ninja' ? ' (moves first)' : opt.mode === 'eagle' ? ' (pulls it into range, once per game)' : '';
          h = '<div class="info"><b>' + esc(a.name) + '</b>' + extra + modeTxt + ' → ' + lines.join('<br>') +
            (risk ? '<br><span class="risk">⚠ If this misses the General, ' + esc(a.name) + ' dies!</span>' : '') + '</div>' +
            '<button class="btn primary" data-act="attack">ATTACK</button>';
        }
      }
    } else {
      h = '<div class="info">Game over.</div>' +
        '<button class="btn primary" data-act="rematch">Rematch</button><button class="btn" data-act="lobby">Lobby</button>';
    }
    bar.innerHTML = h;
  }

  function renderNet() {
    var nb = $('netbar');
    if (G.mode !== 'host' && G.mode !== 'guest') { nb.classList.add('hidden'); return; }
    nb.classList.remove('hidden');
    var txt, ok = false;
    if (G.netStatus !== 'online') txt = 'Reconnecting…';
    else if (!G.oppPresent) txt = (G.mode === 'host' && G.state && G.state.names.p2 === 'Opponent' ? 'Room ' + G.room + ' · waiting for opponent to join…' : 'Opponent disconnected, waiting…');
    else { txt = '● ' + oppName() + ' connected · room ' + G.room; ok = true; }
    if (G.mode === 'guest' && G.hostBuild && G.hostBuild !== C.BUILD) {
      txt = 'Game updated: tap here to reload (' + G.hostBuild + ')'; ok = false;
      nb.onclick = function () { location.reload(); };
    } else nb.onclick = null;
    nb.textContent = txt;
    nb.className = 'netbar' + (ok ? ' ok' : '');
  }

  function fmt(ms) {
    ms = Math.max(0, ms);
    var t = Math.ceil(ms / 1000), m = Math.floor(t / 60), sec = t % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function remaining(st, side) {
    if (!st || !st.clock) return 0;
    var r = st.clock[side];
    if (st.phase === 'battle' && st.turn === side && st.clock.turnStart) {
      var start = st.clock.turnStart + (G.mode === 'guest' ? (G.clockOffset || 0) : 0);
      r -= Date.now() - start;
    }
    return r;
  }
  function renderClocks() {
    var st = G.pendingState || G.state, el = $('clocks');
    if (!st || !st.clock) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    var meS = G.view, opS = R.other(G.view);
    var mr = remaining(st, meS), or = remaining(st, opS);
    $('clockMe').textContent = '⏱ ' + (G.mode === 'hotseat' ? st.names[meS] : 'You') + ' ' + fmt(mr);
    $('clockOpp').textContent = '⏱ ' + st.names[opS] + ' ' + fmt(or);
    $('clockMe').className = st.phase === 'battle' && st.turn === meS ? (mr < 60000 ? 'low' : 'on') : '';
    $('clockOpp').className = st.phase === 'battle' && st.turn === opS ? (or < 60000 ? 'low' : 'on') : '';
  }
  var lastTick = Date.now();
  setInterval(function () {
    var now = Date.now(), gap = now - lastTick; lastTick = now;
    if (!G.mode || $('game').classList.contains('hidden')) return;
    var cur = G.pendingState || G.state;
    if (cur && cur.clock && cur.phase === 'battle' && cur.clock.turnStart && G.mode !== 'guest') {
      // pause the clock while this device slept, or while the online opponent is disconnected on their turn
      var pause = gap > 3000 ? gap : (G.mode === 'host' && !G.oppPresent && cur.turn === 'p2' ? gap : 0);
      if (pause) {
        cur.clock.turnStart += pause;
        if (G.state && G.state !== cur && G.state.clock && G.state.gameId === cur.gameId) G.state.clock.turnStart = cur.clock.turnStart;
        if (G.mode === 'host' && gap > 3000) broadcastState(null, true);
      }
      if (remaining(cur, cur.turn) <= 0 && !G.timingOut) {
        G.timingOut = true;
        commit(R.timeout(cur, cur.turn));
        setTimeout(function () { G.timingOut = false; }, 1000);
      }
    }
    renderClocks();
  }, 250);

  function render(opts) {
    if (!G.state) return;
    renderClocks();
    renderBoard(opts);
    renderBars();
    renderNet();
  }

  // ---------------- attack animation ----------------
  async function playAttack(ev) {
    var d1 = $('die1'), d2 = $('die2'), rt = $('rollText');
    var att = els[ev.attackerId];
    if (att) att.classList.add('attacker');
    for (var k = 0; k < ev.rolls.length; k++) {
      var r = ev.rolls[k];
      r.hits.forEach(function (h) { if (els[h.id]) els[h.id].classList.add('target'); });
      d1.classList.remove('hidden2');
      d2.classList.toggle('hidden2', r.dice.length < 2);
      d1.classList.add('rolling'); d2.classList.add('rolling');
      rt.className = ''; rt.textContent = 'Rolling…';
      for (var i = 0; i < 8; i++) {
        d1.textContent = 1 + Math.floor(Math.random() * 6);
        d2.textContent = 1 + Math.floor(Math.random() * 6);
        await sleep(70);
      }
      d1.classList.remove('rolling'); d2.classList.remove('rolling');
      d1.textContent = r.dice[0]; d2.textContent = r.dice[1] || '';
      var any = r.hits.some(function (h) { return h.success; });
      rt.className = any ? 'good' : 'bad';
      rt.textContent = (r.by ? r.by + ': ' : '') + (r.dice.length < 2 ? r.dice[0] + '×2 = ' : '') + r.total + (r.mod ? ' (' + (r.mod > 0 ? '+' : '') + r.mod + ')' : '') + ' ' +
        r.hits.map(function (h) { return h.killed ? '☠' : h.success ? '✔' : '✖'; }).join('');
      r.hits.forEach(function (h) {
        var el = els[h.id]; if (!el) return;
        if (h.success) el.classList.add('flash-hit');
        if (h.killed) { el.classList.add('dead'); el.insertAdjacentHTML('beforeend', '<div class="tomb">⚰</div>'); }
      });
      await sleep(900);
      r.hits.forEach(function (h) { var el = els[h.id]; if (el) el.classList.remove('flash-hit', 'target'); });
    }
    if (!ev.rolls.length && ev.notes && ev.notes.length) {
      d1.classList.add('hidden2'); d2.classList.add('hidden2');
      rt.className = 'bad'; rt.textContent = ev.notes[0];
      await sleep(1100);
    } else if (ev.notes && ev.notes.length) {
      rt.className = 'good'; rt.textContent = ev.notes.join(' · ');
      await sleep(1000);
    }
    if (ev.attackerDied && att) {
      rt.className = 'bad';
      rt.textContent = /General/.test(ev.dieReason || 'General') ? 'General’s defense! Attacker dies' : ev.attackerName + ' dies: ' + ev.dieReason;
    }
    var extra = false;
    (ev.deaths || []).forEach(function (d) {
      var el = els[d.id];
      if (el && !el.classList.contains('dead')) { el.classList.add('dead'); el.insertAdjacentHTML('beforeend', '<div class="tomb">⚰</div>'); extra = true; }
    });
    if (extra || ev.attackerDied) await sleep(900);
    if (att) att.classList.remove('attacker');
    await sleep(150);
  }

  // ---------------- state pipeline ----------------
  function receive(next) {
    queue = queue.then(function () { return handle(next); }).catch(function (e) { console.error(e); G.animating = false; });
  }

  async function handle(next) {
    var prev = G.state;
    var ev = next.lastEvent || {};
    var isNew = ev.seq != null && ev.seq > G.shownSeq;
    if (prev && next.seq < prev.seq && G.mode === 'guest' && !next._sync) return;
    G.animating = true;
    if (isNew && (ev.kind === 'attack' || ev.kind === 'move') && prev && prev.phase === 'battle') {
      G.sel = null; G.chosen = null; G.swapMode = false;
      renderBars();
      await playAttack(ev);
    }
    G.state = next;
    G.shownSeq = Math.max(G.shownSeq, ev.seq || 0);
    if (ev.kind === 'deal' && prev && prev !== next) {
      Object.keys(els).forEach(function (id) { els[id].remove(); delete els[id]; });
      closeOverlay(); // rematch started by the other player
      $('rollText').textContent = '';
    }
    // hot-seat: pick who views
    if (G.mode === 'hotseat') {
      var want = next.phase === 'deploy' ? (!next.ready.p1 ? 'p1' : 'p2') : next.phase === 'battle' ? next.turn : G.view;
      if (want !== G.view) {
        G.view = want; G.sel = null; G.chosen = null;
        Object.keys(els).forEach(function (id) { els[id].remove(); delete els[id]; });
        G.animating = false;
        await handoff(next.names[want]);
        G.animating = true;
      }
    }
    G.animating = false;
    if (G.sel && !R.findCard(next, G.sel)) { G.sel = null; G.chosen = null; }
    render({ dropEnemy: isNew && ev.kind === 'start' });
    if (isNew && ev.kind === 'start') {
      $('rollText').className = '';
      $('rollText').textContent = (next.first === G.view && G.mode !== 'hotseat' ? 'You go' : next.names[next.first] + ' goes') + ' first!';
      $('die1').classList.add('hidden2'); $('die2').classList.add('hidden2');
    }
    if (isNew && ev.passed) toast(ev.passed.map(function (sd) { return next.names[sd]; }).join(', ') + ' had no legal attack');
    var tracked = G.mode === 'host' || G.mode === 'guest' || G.mode === 'ai';
    if (isNew && tracked) KV_QUESTS.onEvent(next, ev, G.view);
    if (next.phase === 'over' && isNew) {
      G.reward = null;
      if (tracked) {
        var opp = R.other(G.view);
        G.reward = KV_PROFILE.recordGame({ gameId: next.gameId, won: next.winner === G.view, draw: next.winner === 'draw',
          ranked: next.ranked, oppRating: (next.ratings || {})[opp] || 1000 });
        if (G.reward) KV_QUESTS.onGameOver(next, G.view);
        if (G.reward && G.reward.elo) KV_PROFILE.syncLeaderboard(myName());
        refreshPlayerCard();
      }
      setTimeout(function () { gameOverOverlay(); }, 400);
    }
    maybeAI();
  }

  function handoff(name) {
    return new Promise(function (resolve) {
      overlay('<h2>Pass the device</h2><p>Hand it to <b>' + esc(name) + '</b>.</p><button class="btn primary big" id="hoBtn">I’m ' + esc(name) + ' — go</button>');
      $('hoBtn').onclick = function () { closeOverlay(); resolve(); };
    });
  }

  function gameOverOverlay() {
    var s = G.state;
    var won = s.winner === G.view;
    var title = s.winner === 'draw' ? 'Draw' : G.mode === 'hotseat' ? s.names[s.winner] + ' wins!' : won ? 'Victory!' : 'Defeat';
    var rw = G.reward, extra = '';
    if (rw && rw.elo) extra += '<div class="elo ' + (rw.elo.delta >= 0 ? 'up' : 'down') + '">' + rw.elo.tier.icon + ' ' + rw.elo.rating +
      ' (' + (rw.elo.delta >= 0 ? '+' : '') + rw.elo.delta + ')</div>';
    if (rw && rw.chest) extra += '<button class="btn primary big" id="ovChest">' + KV_PROFILE.CHESTS[rw.chest].icon + ' Open ' + KV_PROFILE.CHESTS[rw.chest].name + '</button>';
    overlay('<h2>' + esc(title) + '</h2>' + (s.ranked ? '<div>⚔ Ranked match</div>' : '') + '<p>' + esc(s.log[s.log.length - 1] || '') + '</p>' + extra +
      '<button class="btn ' + (rw && rw.chest ? '' : 'primary ') + 'big" id="ovRematch">Rematch</button><button class="btn big" id="ovClose">View board</button><button class="btn big" id="ovLobby">Lobby</button>');
    if ($('ovChest')) $('ovChest').onclick = function () { openChestOverlay(rw.chest, function () { G.reward.chest = null; gameOverOverlay(); }); };
    $('ovRematch').onclick = function () { closeOverlay(); dispatch({ type: 'rematch' }); };
    $('ovClose').onclick = closeOverlay;
    $('ovLobby').onclick = function () { closeOverlay(); leave(); };
  }

  function ccardHtml(c, cls) {
    return '<div class="ccard rar-' + c.rarity + ' ' + (cls || '') + '" data-key="' + c.key + '"><div class="cart">' + KV_ART.html(c) + '</div>' +
      '<div class="clife">' + esc(c.lifeRaw === 'Inf' ? '∞' : c.life) + '</div><div class="cnm">' + esc(c.name) + '<br><span class="rtag">' +
      KV_PROFILE.RARITY_LABEL[c.rarity] + '</span></div></div>';
  }

  function openChestOverlay(type, done) {
    var ch = KV_PROFILE.CHESTS[type];
    overlay('<h2>' + esc(ch.name) + '</h2><div class="chest shake">' + ch.icon + '</div><p>Opening…</p>');
    setTimeout(function () {
      var r = KV_PROFILE.openChest(type);
      var body = r.kind === 'card'
        ? '<p>New card unlocked!</p><div class="reward">' + ccardHtml(KV_RULES.cardDef(r.key)) + '</div><p>It was added to your deck if there was room.</p>'
        : '<div class="reward chest">🪙</div><p><b>+' + r.coins + ' coins</b> (spend them in the Shop)</p>';
      overlay('<h2>' + esc(ch.name) + '</h2>' + body + '<button class="btn primary big" id="ovChestOk">Nice!</button>');
      refreshPlayerCard();
      $('ovChestOk').onclick = function () { closeOverlay(); done && done(); };
    }, 1600);
  }

  // ---------------- intents ----------------
  function dispatch(intent) {
    if (G.mode === 'guest') {
      if (!KV_NET.send({ type: 'intent', intent: intent, clientId: me().clientId })) toast('Not connected — retrying…');
      // If the host's phone was asleep the intent is lost: re-send actions/ready (never swaps, they'd undo).
      if (intent.type !== 'swap') {
        var seq0 = (G.pendingState || G.state || {}).seq;
        clearTimeout(G.resendTimer);
        var tries = 0;
        var check = function () {
          var cur = (G.pendingState || G.state || {}).seq;
          if (cur !== seq0 || G.mode !== 'guest' || ++tries > 10) return;
          KV_NET.send({ type: 'intent', intent: intent, clientId: me().clientId });
          KV_NET.send({ type: 'sync-request' });
          toast('Waiting for ' + oppName() + '’s phone…');
          G.resendTimer = setTimeout(check, 4000);
        };
        G.resendTimer = setTimeout(check, 4000);
      }
      return;
    }
    var side = G.mode === 'hotseat' ? G.view : 'p1';
    commit(engineApply(side, intent));
  }

  function engineApply(side, intent) {
    var s = G.pendingState || G.state, res = null;
    if (!s) return null;
    if (intent.type === 'swap') res = R.swap(s, side, intent.a, intent.b);
    else if (intent.type === 'ready') res = R.setReady(s, side);
    else if (intent.type === 'action') res = R.act(s, side, intent);
    else if (intent.type === 'skip') res = R.skip(s, side);
    else if (intent.type === 'tswap') res = R.turnSwap(s, side, intent.a, intent.b);
    else if (intent.type === 'rematch' && s.phase === 'over') {
      res = R.newGame({ names: s.names, decks: s.decks, ranked: s.ranked, ratings: s.ratings, clockMs: s.clock ? s.clock.limit : 0 });
      res.guestClient = s.guestClient;
      res.seq = s.seq + 1; res.lastEvent = { kind: 'deal', seq: res.seq };
    }
    return res;
  }

  function clockMs() { var m = +(LS.get('kv-clock') == null ? 10 : LS.get('kv-clock')); return m > 0 ? m * 60000 : 0; }

  // Charge the elapsed time to whoever's turn it was, and start the next turn's clock.
  function stampClock(prev, next) {
    if (!next || !next.clock) return;
    var now = Date.now();
    if (prev && prev.clock && prev.phase === 'battle' && prev.clock.turnStart && prev.gameId === next.gameId) {
      var spent = now - prev.clock.turnStart;
      next.clock[prev.turn] = Math.max(0, prev.clock[prev.turn] - spent);
      next.clock[R.other(prev.turn)] = prev.clock[R.other(prev.turn)];
    }
    next.clock.turnStart = next.phase === 'battle' ? now : null;
  }

  function commit(next) {
    if (!next) { if (G.mode === 'host') broadcastState(); return; }
    if (G.mode !== 'guest') stampClock(G.pendingState || G.state, next);
    if (G.mode === 'host') { LS.set('kv-state-' + G.room, next); }
    if (G.mode === 'ai' || G.mode === 'hotseat') LS.set('kv-local', { mode: G.mode, state: next });
    G.pendingState = next;
    if (G.mode === 'host') broadcastState(next);
    receive(next);
  }

  function broadcastState(st, sync) {
    st = st || G.pendingState || G.state;
    if (!st) return;
    KV_NET.send({ type: 'state', seq: st.seq, state: st, sync: !!sync, build: C.BUILD, hostNow: Date.now() });
  }

  var aiTimer = null;
  function maybeAI() {
    var s = G.state;
    if (G.mode !== 'ai' || !s) return;
    if (s.phase === 'deploy' && !s.ready.p2) { commit(engineApply('p2', { type: 'ready' })); return; }
    if (s.phase === 'battle' && s.turn === 'p2' && !aiTimer) {
      aiTimer = setTimeout(function () {
        aiTimer = null;
        if (G.mode !== 'ai' || G.state.turn !== 'p2' || G.state.phase !== 'battle') return;
        var c = KV_AI.choose(G.state, 'p2');
        if (c && c.swap) commit(engineApply('p2', { type: 'tswap', a: c.swap[0], b: c.swap[1] }));
        else if (c && !(G.state.extra && c.score < 0)) commit(engineApply('p2', { type: 'action', cardId: c.cardId, option: c.option }));
        else if (G.state.extra) commit(engineApply('p2', { type: 'skip' }));
      }, C.AI_THINK_MS || 600);
    }
  }

  // ---------------- input ----------------
  var press = null;
  function cardFromEvent(e) { var el = e.target.closest && e.target.closest('.card'); return el && el.dataset.id; }

  function onBoardPointerDown(e) {
    var id = cardFromEvent(e); if (!id) return;
    press = { id: id, t: setTimeout(function () { press.long = true; openDetails(id); }, 480) };
  }
  function onBoardPointerUp(e) {
    if (!press) return;
    clearTimeout(press.t);
    var p = press; press = null;
    if (p.long) return;
    var id = cardFromEvent(e);
    if (id === p.id) onCardTap(id);
  }
  function cancelPress() { if (press) { clearTimeout(press.t); press = null; } }

  function onCardTap(id) {
    var s = G.state;
    if (!s || G.animating) return;
    var f = R.findCard(s, id);
    if (!f) return;
    if (s.phase === 'deploy') {
      if (f.side !== G.view || s.ready[G.view] || (G.mode === 'ai' && G.view !== 'p1')) return openDetails(id);
      if (!G.sel) G.sel = id;
      else if (G.sel === id) G.sel = null;
      else {
        var a = R.findCard(s, G.sel).index, b = f.index;
        G.sel = null;
        dispatch({ type: 'swap', a: a, b: b });
      }
      return render();
    }
    if (s.phase !== 'battle' || !myTurn()) return openDetails(id);
    if (f.side === G.view && G.sel && G.swapMode) {
      var from = R.findCard(s, G.sel).index;
      G.swapMode = false; G.sel = null; G.chosen = null;
      if (id !== R.findCard(s, id).card.id || from === f.index) return render();
      dispatch({ type: 'tswap', a: from, b: f.index });
      return render();
    }
    if (f.side === G.view && G.sel && G.sel !== id) {
      var ownOpts = R.getOptions(s, G.view, G.sel);
      for (var oi = 0; oi < ownOpts.length; oi++) {
        if (ownOpts[oi].own && ownOpts[oi].targets[0] === id) { G.chosen = { opt: oi, targetId: id }; return render(); }
      }
    }
    if (f.side === G.view) {
      G.swapMode = false;
      if (G.sel === id) { G.sel = null; G.chosen = null; }
      else { G.sel = id; G.chosen = null; }
      return render();
    }
    if (G.sel) {
      var opts = R.getOptions(s, G.view, G.sel);
      var hits = [];
      opts.forEach(function (o, i) { if (o.targets[0] === id) hits.push(i); });          // options where it's the main target first
      opts.forEach(function (o, i) { if (o.targets.indexOf(id) > 0) hits.push(i); });
      var k = hits.length ? hits[0] : -1;
      // tapping the same shared target again cycles through the options containing it
      if (G.chosen && G.chosen.targetId === id && hits.length > 1) k = hits[(hits.indexOf(G.chosen.opt) + 1) % hits.length];
      if (k >= 0) { G.chosen = { opt: k, targetId: id }; return render(); }
    }
    openDetails(id);
  }

  function onActionBar(e) {
    var b = e.target.closest('button'); if (!b) return;
    var act = b.dataset.act;
    if (act === 'ready') { G.sel = null; dispatch({ type: 'ready' }); }
    else if (act === 'attack' && G.sel && G.chosen) {
      var intent = { type: 'action', cardId: G.sel, option: G.chosen.opt, targetId: G.chosen.targetId };
      G.sel = null; G.chosen = null;
      dispatch(intent);
      render();
    }
    else if (act === 'info' && G.sel) openDetails(G.sel);
    else if (act === 'log') openLog();
    else if (act === 'self' && G.sel) {
      var si = { type: 'action', cardId: G.sel, option: +b.dataset.opt };
      G.sel = null; G.chosen = null;
      dispatch(si); render();
    }
    else if (act === 'swapmode') { G.swapMode = true; G.chosen = null; render(); }
    else if (act === 'swapcancel') { G.swapMode = false; render(); }
    else if (act === 'skip') { G.sel = null; G.chosen = null; dispatch({ type: 'skip' }); }
    else if (act === 'rematch') dispatch({ type: 'rematch' });
    else if (act === 'lobby') leave();
  }

  // ---------------- sheets / overlays ----------------
  function openSheet(html) {
    $('sheetBody').innerHTML = html;
    $('sheet').classList.remove('hidden'); $('sheetBack').classList.remove('hidden');
  }
  function closeSheet() { $('sheet').classList.add('hidden'); $('sheetBack').classList.add('hidden'); }
  function overlay(html) { $('overlayBody').innerHTML = html; $('overlay').classList.remove('hidden'); }
  function closeOverlay() { $('overlay').classList.add('hidden'); }
  var toastTimer;
  function toast(msg) {
    var rt = $('rollText'); rt.className = ''; rt.textContent = msg;
    clearTimeout(toastTimer);
  }

  function openDetails(id) {
    var f = R.findCard(G.state, id); if (!f) return;
    var c = f.card, def = R.cardDef(shownKey(c));
    var h = '<div class="detail"><div class="big-art">' + KV_ART.html(def) + '</div><div>' +
      '<h2>' + esc(def.name) + '</h2>' +
      '<div class="kv">Life: <b>' + c.life + '</b>' + (c.rollsToKill > 1 ? ' · hits ' + c.hitsTaken + '/' + c.rollsToKill : '') + '</div>' +
      '<div class="kv">Attack: ' + KV_ART.PATTERN_ICON[def.pattern] + ' ' + esc(KV_ART.PATTERN_TEXT[def.pattern]) + '</div>' +
      '<div class="kv">Team: ' + esc(G.state.names[f.side]) + (f.side === G.view ? ' (you)' : '') + ' · ' + (f.index < 6 ? 'front' : 'back') + ' row</div>' +
      (c.statuses.length ? '<div class="kv">Status: ' + c.statuses.map(function (s) { return s.icon + ' ' + esc(s.type) + (s.n ? ' ' + s.n : '') + ' (' + s.turns + ' turn' + (s.turns > 1 ? 's' : '') + ')'; }).join(', ') + '</div>' : '') +
      (c.dmg ? '<div class="kv">Roll bonus: +' + c.dmg + '</div>' : '') +
      '</div></div><div class="ability">' + esc(def.text || 'No special ability.') +
      (c.isGeneral ? '<br><br><i>Any attack on the General that fails kills the attacker (unless the attacker is the other General). Kill the enemy General to win.</i>' : '') +
      '</div>';
    if (G.sel && G.sel !== id && f.side !== G.view && G.state.phase === 'battle') {
      var a = R.findCard(G.state, G.sel).card, hc = R.hitChance(G.state, a, c);
      h += '<p class="kv">vs your ' + esc(a.name) + ': ' + hc.text + ' → <b>' + pct(hc.p) + '</b></p>';
    }
    openSheet(h + '<button class="btn big" onclick="document.getElementById(\'sheetBack\').click()">Close</button>');
  }

  function openLog() {
    var lines = G.state.log.slice().reverse().map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    openSheet('<h2 style="margin:0 0 8px">Battle log</h2><div class="loglist">' + lines + '</div>');
  }

  function openMenu() {
    var h = '<h2 style="margin:0 0 8px">Menu</h2>';
    if (G.room) h += '<button class="btn big" id="mShare">Share room link (' + G.room + ')</button>';
    h += '<button class="btn big" id="mRules">How to play</button>';
    h += '<button class="btn big" id="mLog">Battle log</button>';
    h += '<button class="btn big danger" id="mLeave">Leave game</button>';
    openSheet(h);
    if ($('mShare')) $('mShare').onclick = function () { closeSheet(); share(); };
    $('mRules').onclick = function () {
      openSheet('<h2 style="margin:0 0 8px">How to play</h2><div class="ability">' +
        '• Each side has 12 cards: a front row and a back row. Enemy column 1 faces your column 1.<br>' +
        '• On your turn pick one of your cards, then a red target. Roll 2 dice: <b>roll ≥ target Life</b> kills it.<br>' +
        '• Most cards only attack from the front row, at the first enemy in their column.<br>' +
        '• Attacking the <b>General ♛</b> and failing kills your attacker.<br>' +
        '• When a front card dies, the card behind steps up. Empty columns close up.<br>' +
        '• Kill the enemy General to win. Long-press any card for details.</div>');
    };
    $('mLog').onclick = openLog;
    $('mLeave').onclick = function () { closeSheet(); leave(); };
  }

  // ---------------- modes ----------------
  function resetBoard() {
    Object.keys(els).forEach(function (id) { els[id].remove(); delete els[id]; });
    G.sel = null; G.chosen = null; G.shownSeq = -1; G.state = null; G.pendingState = null;
    $('rollText').textContent = '';
  }

  function startLocal(mode, resume) {
    KV_NET.close();
    resetBoard();
    G.mode = mode; G.room = null; G.view = 'p1';
    var names = mode === 'ai' ? { p1: myName(), p2: 'Computer' } : { p1: myName() || 'Player 1', p2: 'Player 2' };
    if (mode === 'hotseat') {
      var n2 = ($('name2Input').value || '').trim();
      names.p2 = (n2 || 'Player 2').slice(0, 16);
      LS.set('kv-name2', names.p2);
    }
    show('game');
    var opts = { names: names, clockMs: clockMs() };
    if (mode === 'ai') opts.decks = { p1: KV_PROFILE.deckForGame(), p2: null };
    commit(resume || R.newGame(opts));
  }

  function randomCode() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', s = '';
    for (var i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  function roomUrl(code) { return location.origin + location.pathname + '?room=' + code; }

  function setUrlRoom(code) {
    try { history.replaceState(null, '', code ? '?room=' + code : location.pathname); } catch (e) {}
  }

  function me() { return KV_PROFILE.get(); }

  function startHost(code, resume, ranked) {
    if (!KV_NET.available()) { alert('Online play is not configured yet.'); return; }
    resetBoard();
    G.mode = 'host'; G.room = code; G.view = 'p1';
    LS.set('kv-session', { room: code, role: 'host', ranked: !!ranked });
    setUrlRoom(code);
    show('game');
    var saved = resume && LS.get('kv-state-' + code);
    var st = saved || R.newGame({ names: { p1: myName(), p2: 'Opponent' }, decks: { p1: KV_PROFILE.deckForGame(), p2: null },
      ranked: !!ranked, ratings: { p1: me().rating }, clockMs: ranked ? 10 * 60000 : clockMs() });
    if (saved) { st.seq++; st.lastEvent = Object.assign({}, st.lastEvent, { seq: st.seq, kind: 'resume' }); }
    commit(st);
    KV_NET.connect({
      room: code, role: 'host', name: myName(), clientId: me().clientId,
      onStatus: function (s) { G.netStatus = s; renderNet(); },
      onPresence: function (present, name, metas) {
        var cur = G.pendingState || G.state;
        var reg = cur && cur.guestClient;
        G.guestMetas = metas || [];
        var regHere = !reg || G.guestMetas.some(function (m) { return m.clientId === reg; });
        var was = G.oppPresent; G.oppPresent = present && regHere; renderNet();
        if (G.oppPresent && !was) broadcastState(null, true);
      },
      onOpen: function () { broadcastState(null, true); },
      onMessage: hostOnMessage,
    });
    if (!saved && !ranked) shareOverlay(code);
  }

  // Room is host + one guest. The first guest's device id is locked in; others get "room full"
  // (unless the registered guest is gone, e.g. a new phone - then the newcomer takes the seat).
  function guestAllowed(clientId) {
    var cur = G.pendingState || G.state;
    if (!cur || !clientId || !cur.guestClient || cur.guestClient === clientId) return true;
    var regHere = (G.guestMetas || []).some(function (x) { return x.clientId === cur.guestClient; });
    return !regHere;
  }

  function hostOnMessage(m) {
    if (!m || !G.state) return;
    if (m.clientId && !guestAllowed(m.clientId)) { KV_NET.send({ type: 'full', to: m.clientId }); return; }
    if (m.type === 'hello') {
      var cur = G.pendingState || G.state;
      var s = R.clone(cur), changed = false;
      if (m.clientId && s.guestClient !== m.clientId) { s.guestClient = m.clientId; changed = true; }
      if (m.name && s.names.p2 !== m.name) { s.names.p2 = String(m.name).slice(0, 16); changed = true; }
      if (m.rating && (s.ratings || {}).p2 !== m.rating) { s.ratings = s.ratings || {}; s.ratings.p2 = +m.rating; changed = true; }
      if (m.deck && s.phase === 'deploy' && !s.ready.p2 && JSON.stringify(s.decks.p2) !== JSON.stringify(m.deck)) {
        var rd = R.redeal(s, 'p2', m.deck.slice(0, 40));
        if (rd) { s = rd; changed = true; }
      }
      if (changed) { s.seq++; s.lastEvent = { kind: s.lastEvent && s.lastEvent.kind === 'deal' ? 'deal' : 'names', seq: s.seq }; commit(s); }
      else broadcastState(null, true);
    } else if (m.type === 'sync-request') {
      broadcastState(null, true);
    } else if (m.type === 'intent' && m.intent) {
      var c2 = G.pendingState || G.state;
      if (c2.guestClient && m.clientId && m.clientId !== c2.guestClient) return;
      commit(engineApply('p2', m.intent));
    }
  }

  var syncTimer = null;
  function startGuest(code) {
    if (!KV_NET.available()) { alert('Online play is not configured yet.'); return; }
    resetBoard();
    G.mode = 'guest'; G.room = code; G.view = 'p2';
    LS.set('kv-session', { room: code, role: 'guest' });
    setUrlRoom(code);
    show('game');
    $('banner').textContent = 'Joining ' + code + '…';
    $('actionbar').innerHTML = '<div class="info">Connecting to room <b>' + code + '</b>…</div>';
    var hello = function () {
      KV_NET.send({ type: 'hello', name: myName(), clientId: me().clientId, rating: me().rating, deck: KV_PROFILE.deckForGame() });
      KV_NET.send({ type: 'sync-request', clientId: me().clientId });
    };
    KV_NET.connect({
      room: code, role: 'guest', name: myName(), clientId: me().clientId,
      onStatus: function (s) { G.netStatus = s; renderNet(); },
      onPresence: function (present) { var was = G.oppPresent; G.oppPresent = present; renderNet(); if (present && !was) hello(); },
      onOpen: hello,
      onMessage: function (m) {
        if (m && m.type === 'full' && m.to === me().clientId) {
          KV_NET.close(); LS.del('kv-session'); G.mode = null; setUrlRoom(null);
          overlay('<h2>Room full</h2><p>Room ' + esc(code) + ' already has two players.</p><button class="btn primary big" id="ovFull">Back to lobby</button>');
          $('ovFull').onclick = function () { closeOverlay(); lobby(); };
          return;
        }
        if (!m || m.type !== 'state' || !m.state) return;
        if (m.hostNow) G.clockOffset = Date.now() - m.hostNow;
        if (m.build && m.build !== C.BUILD && G.hostBuild !== m.build) { G.hostBuild = m.build; renderNet(); }
        var latest = G.pendingState || G.state;
        if (latest && m.state.seq <= latest.seq && !(m.sync && m.state.seq < latest.seq)) return;
        if (latest && m.state.seq < latest.seq && m.sync) m.state._sync = true;
        G.pendingState = m.state;
        receive(m.state);
      },
    });
    clearInterval(syncTimer);
    syncTimer = setInterval(function () {
      if (G.mode !== 'guest') return clearInterval(syncTimer);
      if (!G.state && KV_NET.status() === 'online') hello();
    }, 3000);
  }

  function findRanked() {
    if (!KV_NET.available()) { alert('Online play is not configured yet.'); return; }
    var P = me();
    overlay('<h2>⚔ Ranked</h2><p>' + KV_PROFILE.tier(P.rating).icon + ' ' + P.rating + '</p><div class="chest shake" style="font-size:60px">⚔</div>' +
      '<p id="qStatus">Searching for an opponent…</p><button class="btn big" id="qCancel">Cancel</button>');
    $('qCancel').onclick = function () { KV_NET.leaveQueue(); closeOverlay(); };
    KV_NET.queue({
      clientId: P.clientId, name: myName(), rating: P.rating, makeRoom: randomCode,
      onCount: function (n) { var e = $('qStatus'); if (e) e.textContent = n > 1 ? 'Opponent found - connecting…' : 'Searching for an opponent… (you are the only one waiting)'; },
      onMatch: function (m) {
        closeOverlay();
        if (m.role === 'host') startHost(m.room, false, true);
        else startGuest(m.room);
      },
    });
  }

  function shareOverlay(code) {
    overlay('<h2>Game created</h2><p>Send this to your opponent:</p><div class="code-big">' + code + '</div>' +
      '<button class="btn primary big" id="ovShare">Share invite link</button>' +
      '<button class="btn big" id="ovGo">Start deploying</button>');
    $('ovShare').onclick = share;
    $('ovGo').onclick = closeOverlay;
  }

  function share() {
    var url = roomUrl(G.room);
    var text = "Join my King's Vendetta game! Room " + G.room;
    if (navigator.share) navigator.share({ title: "King's Vendetta", text: text, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert('Link copied:\n' + url); });
    else prompt('Copy this link:', url);
  }

  function leave() {
    KV_NET.close();
    clearTimeout(aiTimer); aiTimer = null;
    LS.del('kv-session');
    if (G.mode === 'ai' || G.mode === 'hotseat') LS.del('kv-local');
    G.mode = null; G.room = null;
    resetBoard();
    setUrlRoom(null);
    releaseWake();
    lobby();
  }

  // ---------------- wake lock ----------------
  var wakeLock = null;
  function requestWake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || !G.mode) return;
    navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
  }
  function releaseWake() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') requestWake(); });

  // ---------------- library ----------------
  function showLibrary() {
    var cards = KV_CARDS.slice().sort(function (a, b) { return (b.ready - a.ready) || a.name.localeCompare(b.name); });
    var nReady = cards.filter(function (c) { return c.ready; }).length;
    $('libList').innerHTML = '<p>' + nReady + ' of ' + cards.length + ' cards ready (in the deal pool).</p>' + cards.map(function (c) {
      return '<div class="libitem"><div class="thumb">' + KV_ART.html(c) + '</div><div class="meta"><b>' + esc(c.name) + '</b> · Life ' + esc(c.lifeRaw) +
        ' · ' + KV_ART.PATTERN_ICON[c.pattern] + ' ' + esc(c.pattern) + '<small>' + esc(c.text) + '</small>' +
        (c.ready ? '' : '<small>Missing: ' + esc(c.note) + '</small>') + '</div>' +
        '<span class="tag ' + (c.ready ? 'ok' : 'no') + '">' + (c.ready ? 'READY' : 'LATER') + '</span></div>';
    }).join('');
    show('library');
  }

  // ---------------- collection / deck ----------------
  var colFilter = 'all';
  function showCollection() {
    var P = me(), all = KV_PROFILE.cards();
    var order = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
    var list = all.filter(function (c) {
      var owned = P.owned.indexOf(c.key) >= 0;
      return colFilter === 'all' || (colFilter === 'deck' ? P.deck.indexOf(c.key) >= 0 : colFilter === 'owned' ? owned : colFilter === 'locked' ? !owned : c.rarity === colFilter);
    }).sort(function (a, b) {
      var oa = P.owned.indexOf(a.key) >= 0 ? 0 : 1, ob = P.owned.indexOf(b.key) >= 0 ? 0 : 1;
      return oa - ob || order[a.rarity] - order[b.rarity] || a.name.localeCompare(b.name);
    });
    $('colCount').innerHTML = 'Deck <b>' + P.deck.length + '/' + KV_PROFILE.DECK_SIZE + '</b>' + (P.deck.length < KV_PROFILE.DECK_SIZE ? ' <span style="color:#f0b36a">(tap owned cards to add)</span>' : '');
    $('colOwned').textContent = P.owned.length + ' / ' + all.length + ' owned';
    $('colFilter').innerHTML = ['all', 'deck', 'owned', 'locked', 'common', 'uncommon', 'rare', 'epic', 'legendary'].map(function (f) {
      return '<button data-f="' + f + '" class="' + (f === colFilter ? 'on' : '') + '">' + f[0].toUpperCase() + f.slice(1) + '</button>';
    }).join('');
    $('colGrid').innerHTML = list.map(function (c) {
      var owned = P.owned.indexOf(c.key) >= 0;
      return ccardHtml(c, (owned ? '' : 'locked') + (P.deck.indexOf(c.key) >= 0 ? ' indeck' : ''));
    }).join('');
    $('colTitle').textContent = 'Deck & Cards';
    show('collection');
  }
  function onCollectionTap(e) {
    var f = e.target.closest('[data-f]');
    if (f) { colFilter = f.dataset.f; return showCollection(); }
    var cc = e.target.closest('.ccard'); if (!cc) return;
    var key = cc.dataset.key, P = me(), c = KV_RULES.cardDef(key);
    if (P.owned.indexOf(key) < 0) {
      openSheet('<h2 style="margin:0">' + esc(c.name) + ' 🔒</h2><p>' + KV_PROFILE.RARITY_LABEL[c.rarity] + ' · Life ' + esc(c.lifeRaw) +
        '</p><div class="ability">' + esc(c.text) + '</div><p>Unlock it from chests - win or lose a game to earn one.</p>');
      return;
    }
    if (!KV_PROFILE.toggleDeck(key)) toast('');
    if (P.deck.indexOf(key) < 0 && P.deck.length >= KV_PROFILE.DECK_SIZE && !cc.classList.contains('indeck')) {
      openSheet('<p>Your deck is full (' + KV_PROFILE.DECK_SIZE + '). Tap a card with a ✓ to remove it first.</p>');
    }
    var y = window.scrollY; showCollection(); window.scrollTo(0, y);
  }

  function showProfile() {
    var P = me(), t = KV_PROFILE.tier(P.rating);
    var h = '<div class="panel"><h2 style="margin:0">' + esc(myName()) + '</h2>' +
      '<p style="font-size:20px">' + t.icon + ' ' + t.name + ' · <b>' + P.rating + '</b> Elo</p>' +
      '<p>Ranked games: ' + P.rankedGames + ' · Wins ' + P.wins + ' · Losses ' + P.losses + ' · Draws ' + P.draws + '</p>' +
      '<p>🪙 <b>' + P.coins + '</b> coins · 🃏 ' + P.owned.length + ' cards</p></div>';
    h += '<div class="panel"><div class="panel-title">Board themes</div><div class="themes">' + KV_PROFILE.THEMES.map(function (th) {
      var owned = P.themes.indexOf(th.id) >= 0;
      return '<div class="theme theme-' + th.id + (P.theme === th.id ? ' on' : '') + '" data-theme="' + th.id + '"><b>' + esc(th.name) + '</b><br>' +
        (P.theme === th.id ? 'Equipped' : owned ? 'Tap to equip' : '🪙 ' + th.price) + '</div>';
    }).join('') + '</div></div>';
    h += '<div class="panel"><div class="panel-title">Backup</div><p>Your cards, coins and rating live on this device. Copy this code to move them to another phone:</p>' +
      '<textarea class="code" readonly id="bkCode">' + KV_PROFILE.backupCode() + '</textarea>' +
      '<button class="btn" id="bkCopy">Copy code</button> <button class="btn" id="bkRestore">Restore from code…</button></div>';
    $('profBody').innerHTML = h;
    show('profile');
  }
  function onProfileTap(e) {
    var th = e.target.closest('[data-theme]');
    if (th) {
      var id = th.dataset.theme, t = KV_PROFILE.THEMES.filter(function (x) { return x.id === id; })[0], P = me();
      if (P.themes.indexOf(id) < 0 && !confirm('Buy ' + t.name + ' for ' + t.price + ' coins?')) return;
      if (!KV_PROFILE.buyTheme(id)) alert('Not enough coins yet - open chests to earn more.');
      return showProfile();
    }
    if (e.target.id === 'bkCopy') {
      var ta = $('bkCode'); ta.select();
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { alert('Copied!'); });
      else document.execCommand('copy');
    }
    if (e.target.id === 'bkRestore') {
      var code = prompt('Paste your backup code:');
      if (code) { alert(KV_PROFILE.restore(code) ? 'Restored!' : 'That code did not work.'); refreshPlayerCard(); showProfile(); }
    }
  }

  function renderQuests() {
    var list = KV_QUESTS.list();
    $('questList').innerHTML = list.map(function (q) {
      var reward = '🪙' + q.coins + (q.chest ? ' + ' + KV_PROFILE.CHESTS[q.chest].icon : '');
      var right = q.claimed ? '<span class="qr">✓ Claimed</span>' : q.done ? '<button class="btn primary" data-claim="' + q.id + '">Claim</button>' :
        '<span class="qr">' + q.have + '/' + q.goal + '</span>';
      return '<div class="quest' + (q.claimed ? ' claimed' : '') + '"><div class="qt">' + esc(q.text) + ' <span class="qr">' + reward + '</span>' +
        '<div class="bar"><i style="width:' + Math.round(100 * q.have / q.goal) + '%"></i></div></div>' + right + '</div>';
    }).join('');
    var now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), h = Math.floor((mid - now) / 3600000), m = Math.floor((mid - now) / 60000) % 60;
    $('questReset').textContent = '· new quests in ' + h + 'h ' + m + 'm';
  }
  function onQuestTap(e) {
    var b = e.target.closest('[data-claim]'); if (!b) return;
    var r = KV_QUESTS.claim(b.dataset.claim);
    if (!r) return;
    refreshPlayerCard(); renderQuests();
    if (r.chest) openChestOverlay(r.chest, function () { refreshPlayerCard(); });
    else { overlay('<h2>Quest complete!</h2><div class="reward chest">🪙</div><p><b>+' + r.coins + ' coins</b></p><button class="btn primary big" id="ovQ">Nice!</button>'); $('ovQ').onclick = closeOverlay; }
  }

  function showLeaders() {
    show('leaders');
    $('lbBody').innerHTML = '<p>Loading…</p>';
    var P = me();
    KV_PROFILE.syncLeaderboard(myName()).then(function () { return KV_PROFILE.fetchLeaderboard(); }).then(function (rows) {
      if (!rows.length) { $('lbBody').innerHTML = '<p>No ranked games yet. Play a ⚔ Ranked match to get on the board!</p>'; return; }
      var mine = rows.findIndex(function (r) { return r.client_id === P.clientId; });
      $('lbBody').innerHTML = (mine < 0 ? '<p>' + (P.rankedGames ? 'You are not in the top 100 yet.' : 'Play a ranked match to join the board.') + '</p>' : '') +
        rows.map(function (r, i) {
          var t = KV_PROFILE.tier(r.rating), medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
          return '<div class="lbrow' + (r.client_id === P.clientId ? ' me' : '') + '"><span class="rk">' + medal + '</span><span class="nm2">' + esc(r.name) +
            '<small>' + t.icon + ' ' + t.name + ' · ' + r.wins + 'W ' + r.losses + 'L' + (r.draws ? ' ' + r.draws + 'D' : '') + '</small></span><span class="rt">' + r.rating + '</span></div>';
        }).join('');
    });
  }

  function refreshPlayerCard() {
    var P = me(), t = KV_PROFILE.tier(P.rating);
    $('pcTier').textContent = t.icon + ' ' + t.name;
    $('pcRating').textContent = P.rating;
    $('pcCoins').textContent = '🪙 ' + P.coins;
    $('pcCards').textContent = P.owned.length + ' cards';
  }

  // ---------------- lobby ----------------
  function lobby() {
    refreshPlayerCard();
    renderQuests();
    show('lobby');
    var code = new URLSearchParams(location.search).get('room');
    $('joinBanner').classList.toggle('hidden', !code);
    if (code) $('joinBannerCode').textContent = code.toUpperCase();
  }

  function needName() {
    if ((($('nameInput').value) || '').trim()) { LS.set('kv-name', myName()); return true; }
    $('nameInput').focus();
    $('nameInput').style.borderColor = '#c0392b';
    return false;
  }

  function init() {
    $('version').textContent = 'build ' + (C.BUILD || 'dev');
    $('nameInput').value = LS.get('kv-name') || '';
    $('name2Input').value = LS.get('kv-name2') || '';
    $('nameInput').addEventListener('change', function () { LS.set('kv-name', myName()); });
    $('netWarn').classList.toggle('hidden', KV_NET.available());
    $('createBtn').onclick = function () { if (needName()) startHost(randomCode(), false); };
    $('joinBtn').onclick = function () {
      var c = ($('codeInput').value || '').trim().toUpperCase();
      if (c.length !== 4) return $('codeInput').focus();
      if (needName()) startGuest(c);
    };
    $('joinBannerBtn').onclick = function () {
      if (needName()) startGuest(new URLSearchParams(location.search).get('room').toUpperCase());
    };
    $('hotseatBtn').onclick = function () { if (needName()) startLocal('hotseat'); };
    $('aiBtn').onclick = function () { if (needName()) startLocal('ai'); };
    $('libraryBtn').onclick = showLibrary;
    $('rankedBtn').onclick = function () { if (needName()) findRanked(); };
    $('collectionBtn').onclick = function () { colFilter = 'all'; showCollection(); };
    $('profileBtn').onclick = function () { if (needName()) showProfile(); };
    $('colBack').onclick = lobby;
    $('leaderBtn').onclick = function () { if (needName()) showLeaders(); };
    $('lbBack').onclick = lobby;
    $('lbRefresh').onclick = showLeaders;
    $('questList').addEventListener('click', onQuestTap);
    if (KV_PROFILE.get().rankedGames) KV_PROFILE.syncLeaderboard(myName());
    $('profBack').onclick = lobby;
    $('colGrid').addEventListener('click', onCollectionTap);
    $('colFilter').addEventListener('click', onCollectionTap);
    $('profBody').addEventListener('click', onProfileTap);
    $('clockSelect').value = String(LS.get('kv-clock') == null ? 10 : LS.get('kv-clock'));
    $('clockSelect').onchange = function () { LS.set('kv-clock', +this.value); };
    KV_PROFILE.applyTheme();
    $('libBack').onclick = lobby;
    $('menuBtn').onclick = openMenu;
    $('logBtn').onclick = function () { if (G.state) openLog(); };
    $('sheetBack').onclick = closeSheet;
    $('actionbar').addEventListener('click', onActionBar);
    var board = $('board');
    board.addEventListener('pointerdown', onBoardPointerDown);
    board.addEventListener('pointerup', onBoardPointerUp);
    board.addEventListener('pointercancel', cancelPress);
    board.addEventListener('pointerleave', cancelPress);
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('resize', function () { if (!$('game').classList.contains('hidden')) layout(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    // Resume / auto-join
    var code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    var sess = LS.get('kv-session');
    if (code && sess && sess.room === code && sess.role === 'host' && LS.get('kv-state-' + code)) return startHost(code, true);
    if (code && LS.get('kv-name') && KV_NET.available()) return startGuest(code);
    lobby();
  }

  window.KV_UI = { G: G, dispatch: dispatch, startLocal: startLocal };
  document.addEventListener('DOMContentLoaded', init);
})();
