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
    ['lobby', 'game', 'library'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
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
  function cardInner(card) {
    var def = R.cardDef(card.cardKey);
    var h = '<div class="art">' + KV_ART.html(def) + '</div>';
    h += '<div class="life">' + card.life + '</div>';
    h += '<div class="pat">' + (KV_ART.PATTERN_ICON[def.pattern] || '') + '</div>';
    if (card.rollsToKill > 1) {
      h += '<div class="pips">';
      for (var i = 0; i < card.rollsToKill; i++) h += '<i class="' + (i < card.hitsTaken ? 'hit' : '') + '"></i>';
      h += '</div>';
    }
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
        selOpts.forEach(function (o) { o.targets.forEach(function (t) { targetIds[t] = true; }); });
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
        var sig = card.cardKey + '|' + card.life + '|' + card.hitsTaken + '|' + JSON.stringify(card.statuses);
        if (el._sig !== sig) { el.innerHTML = cardInner(card); el._sig = sig; }
        var cls = 'card ' + (side === G.view ? 'mine' : 'enemy');
        if (card.isGeneral) cls += ' general';
        if (G.sel === card.id) cls += ' sel';
        if (actable[card.id] && G.sel !== card.id) cls += ' can-act';
        if (targetIds[card.id]) cls += ' target';
        if (chosenIds[card.id]) cls += ' chosen';
        if (s.phase === 'battle' && side === G.view && myTurn() && !actable[card.id]) cls += ' dim';
        el.className = cls;
        var old = el.querySelector('.odds'); if (old) old.remove();
        if (targetIds[card.id] && selCard) {
          var hc = R.hitChance(s, selCard.card, card);
          var d = document.createElement('div'); d.className = 'odds'; d.textContent = pct(hc.p);
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
      ban.textContent = mine ? (G.mode === 'hotseat' ? s.names[G.view] + ': your turn' : 'Your turn') : opp + "'s turn…";
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
      } else if (!G.sel) {
        h = '<div class="info">Tap one of your <b>glowing</b> cards to attack with it.</div>';
      } else {
        var a = R.findCard(s, G.sel).card, def = R.cardDef(a.cardKey);
        var opts = R.getOptions(s, G.view, G.sel);
        if (!opts.length) {
          h = '<div class="info"><b>' + esc(a.name) + '</b> has no targets from here.</div><button class="btn" data-act="info">ⓘ</button>';
        } else if (!G.chosen) {
          h = '<div class="info"><b>' + esc(a.name) + '</b> ' + KV_ART.PATTERN_ICON[def.pattern] + ' ' + esc(KV_ART.PATTERN_TEXT[def.pattern]) +
            '<br>Tap a red target.</div><button class="btn" data-act="info">ⓘ</button>';
        } else {
          var opt = opts[G.chosen.opt];
          var lines = opt.targets.map(function (id) {
            var t = R.findCard(s, id).card, hc = R.hitChance(s, a, t);
            return esc(t.name) + ': ' + hc.text + ' → <b>' + pct(hc.p) + '</b>';
          });
          var risk = opt.targets.some(function (id) { return R.generalRisk(a, R.findCard(s, id).card); });
          var extra = (R.ab(a).attacks || 1) > 1 ? ' (attacks ' + R.ab(a).attacks + '×)' : '';
          h = '<div class="info"><b>' + esc(a.name) + '</b>' + extra + ' → ' + lines.join('<br>') +
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
    nb.textContent = txt;
    nb.className = 'netbar' + (ok ? ' ok' : '');
  }

  function render(opts) {
    if (!G.state) return;
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
      rt.textContent = (r.dice.length < 2 ? r.dice[0] + '×2 = ' : '') + r.total + (r.mod ? ' (' + (r.mod > 0 ? '+' : '') + r.mod + ')' : '') + ' ' +
        r.hits.map(function (h) { return h.killed ? '☠' : h.success ? '✔' : '✖'; }).join('');
      r.hits.forEach(function (h) {
        var el = els[h.id]; if (!el) return;
        if (h.success) el.classList.add('flash-hit');
        if (h.killed) { el.classList.add('dead'); el.insertAdjacentHTML('beforeend', '<div class="tomb">⚰</div>'); }
      });
      await sleep(900);
      r.hits.forEach(function (h) { var el = els[h.id]; if (el) el.classList.remove('flash-hit', 'target'); });
    }
    if (ev.attackerDied && att) {
      rt.className = 'bad'; rt.textContent = 'General’s defense! Attacker dies';
      att.classList.add('dead'); att.insertAdjacentHTML('beforeend', '<div class="tomb">⚰</div>');
      await sleep(900);
    }
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
    if (isNew && ev.kind === 'attack' && prev && prev.phase === 'battle') {
      G.sel = null; G.chosen = null;
      renderBars();
      await playAttack(ev);
    }
    G.state = next;
    G.shownSeq = Math.max(G.shownSeq, ev.seq || 0);
    if (ev.kind === 'deal' && prev && prev !== next) { Object.keys(els).forEach(function (id) { els[id].remove(); delete els[id]; }); }
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
    if (next.phase === 'over' && isNew) setTimeout(function () { gameOverOverlay(); }, 400);
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
    overlay('<h2>' + esc(title) + '</h2><p>' + esc(s.log[s.log.length - 1] || '') + '</p>' +
      '<button class="btn primary big" id="ovRematch">Rematch</button><button class="btn big" id="ovClose">View board</button><button class="btn big" id="ovLobby">Lobby</button>');
    $('ovRematch').onclick = function () { closeOverlay(); dispatch({ type: 'rematch' }); };
    $('ovClose').onclick = closeOverlay;
    $('ovLobby').onclick = function () { closeOverlay(); leave(); };
  }

  // ---------------- intents ----------------
  function dispatch(intent) {
    if (G.mode === 'guest') {
      if (!KV_NET.send({ type: 'intent', intent: intent })) toast('Not connected — retrying…');
      // If the host's phone was asleep the intent is lost: re-send actions/ready (never swaps, they'd undo).
      if (intent.type !== 'swap') {
        var seq0 = (G.pendingState || G.state || {}).seq;
        clearTimeout(G.resendTimer);
        var tries = 0;
        var check = function () {
          var cur = (G.pendingState || G.state || {}).seq;
          if (cur !== seq0 || G.mode !== 'guest' || ++tries > 10) return;
          KV_NET.send({ type: 'intent', intent: intent });
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
    else if (intent.type === 'rematch' && s.phase === 'over') {
      res = R.newGame({ names: s.names });
      res.seq = s.seq + 1; res.lastEvent = { kind: 'deal', seq: res.seq };
    }
    return res;
  }

  function commit(next) {
    if (!next) { if (G.mode === 'host') broadcastState(); return; }
    if (G.mode === 'host') { LS.set('kv-state-' + G.room, next); }
    if (G.mode === 'ai' || G.mode === 'hotseat') LS.set('kv-local', { mode: G.mode, state: next });
    G.pendingState = next;
    if (G.mode === 'host') broadcastState(next);
    receive(next);
  }

  function broadcastState(st, sync) {
    st = st || G.pendingState || G.state;
    if (!st) return;
    KV_NET.send({ type: 'state', seq: st.seq, state: st, sync: !!sync });
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
        if (c) commit(engineApply('p2', { type: 'action', cardId: c.cardId, option: c.option }));
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
    if (f.side === G.view) {
      if (G.sel === id) { G.sel = null; G.chosen = null; }
      else { G.sel = id; G.chosen = null; }
      return render();
    }
    if (G.sel) {
      var opts = R.getOptions(s, G.view, G.sel);
      var hits = [];
      opts.forEach(function (o, i) { if (o.targets.indexOf(id) >= 0) hits.push(i); });
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
    var c = f.card, def = R.cardDef(c.cardKey);
    var h = '<div class="detail"><div class="big-art">' + KV_ART.html(def) + '</div><div>' +
      '<h2>' + esc(def.name) + '</h2>' +
      '<div class="kv">Life: <b>' + c.life + '</b>' + (c.rollsToKill > 1 ? ' · hits ' + c.hitsTaken + '/' + c.rollsToKill : '') + '</div>' +
      '<div class="kv">Attack: ' + KV_ART.PATTERN_ICON[def.pattern] + ' ' + esc(KV_ART.PATTERN_TEXT[def.pattern]) + '</div>' +
      '<div class="kv">Team: ' + esc(G.state.names[f.side]) + (f.side === G.view ? ' (you)' : '') + ' · ' + (f.index < 6 ? 'front' : 'back') + ' row</div>' +
      (c.statuses.length ? '<div class="kv">Status: ' + c.statuses.map(function (s) { return esc(s.type); }).join(', ') + '</div>' : '') +
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
    commit(resume || R.newGame({ names: names }));
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

  function startHost(code, resume) {
    if (!KV_NET.available()) { alert('Online play is not configured yet.'); return; }
    resetBoard();
    G.mode = 'host'; G.room = code; G.view = 'p1';
    LS.set('kv-session', { room: code, role: 'host' });
    setUrlRoom(code);
    show('game');
    var saved = resume && LS.get('kv-state-' + code);
    var st = saved || R.newGame({ names: { p1: myName(), p2: 'Opponent' } });
    if (saved) { st.seq++; st.lastEvent = Object.assign({}, st.lastEvent, { seq: st.seq, kind: 'resume' }); }
    commit(st);
    KV_NET.connect({
      room: code, role: 'host', name: myName(),
      onStatus: function (s) { G.netStatus = s; renderNet(); },
      onPresence: function (present) {
        var was = G.oppPresent; G.oppPresent = present; renderNet();
        if (present && !was) broadcastState(null, true);
      },
      onOpen: function () { broadcastState(null, true); },
      onMessage: hostOnMessage,
    });
    if (!saved) shareOverlay(code);
  }

  function hostOnMessage(m) {
    if (!m || !G.state) return;
    if (m.type === 'hello') {
      var cur = G.pendingState || G.state;
      if (m.name && cur.names.p2 !== m.name) {
        var s = R.clone(cur);
        s.names.p2 = String(m.name).slice(0, 16);
        s.seq++; s.lastEvent = { kind: 'names', seq: s.seq };
        commit(s);
      } else broadcastState(null, true);
    } else if (m.type === 'sync-request') {
      broadcastState(null, true);
    } else if (m.type === 'intent' && m.intent) {
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
    var hello = function () { KV_NET.send({ type: 'hello', name: myName() }); KV_NET.send({ type: 'sync-request' }); };
    KV_NET.connect({
      room: code, role: 'guest', name: myName(),
      onStatus: function (s) { G.netStatus = s; renderNet(); },
      onPresence: function (present) { var was = G.oppPresent; G.oppPresent = present; renderNet(); if (present && !was) hello(); },
      onOpen: hello,
      onMessage: function (m) {
        if (!m || m.type !== 'state' || !m.state) return;
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

  // ---------------- lobby ----------------
  function lobby() {
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
