// Simple enemy AI: score every (card, option) by sum of P(kill) x target value, minus General-attack risk.
var KV_AI = (function () {
  var R = KV_RULES;

  var noise = 1.5; // randomness in the AI's choices (campaign: high = easy, low = sharp)
  function setNoise(n) { noise = n == null ? 1.5 : n; }

  function value(card) {
    if (card.isGeneral) return 100;
    return 4 + (card.baseLife || 6) + (card.rollsToKill - 1) * 3;
  }

  function choose(state, side, rng, nested) {
    rng = rng || Math.random;
    var best = null;
    R.legalActions(state, side).forEach(function (a) {
      var att = R.findCard(state, a.cardId).card;
      var score = 0, risk = 0, expKills = 0;
      var FIXED = { hailMary: -60, cleanse: 4, manipulate: 1, swapAlly: -5, wagonSwitch: -3, charge: 3, summon: 8 };
      if (a.mode === 'steal') FIXED.steal = value(R.findCard(state, a.targets[0]).card) * 0.8;
      if (a.mode && FIXED[a.mode] != null) {
        var fixed = FIXED[a.mode] + rng();
        if (!best || fixed > best.score) best = { score: fixed, cardId: a.cardId, option: a.option };
        return;
      }
      a.targets.forEach(function (id) {
        var t = R.findCard(state, id).card;
        var hc = R.hitChance(state, att, t);
        var left = t.rollsToKill - t.hitsTaken;
        var pKill = left > 1 ? hc.p * 0.35 : hc.p;
        score += pKill * value(t);
        expKills += pKill;
        if (R.generalRisk(att, t)) risk = Math.max(risk, (1 - hc.p) * value(att) * 1.2);
        if (R.ab(t).onKilled && !att.isGeneral) risk += pKill * value(att); // e.g. Fire Sentinel takes killer down
      });
      var need = R.ab(att).mustKill;
      if (need && expKills < need) risk += value(att) * (1 - expKills / need);
      if (R.ab(att).customAction) {
        // one-shot specials (e.g. Thunder Warrior): rarely worth the card
        score = a.targets.reduce(function (sum, id) { return sum + value(R.findCard(state, id).card) * (R.ab(att).customSafe ? 0.45 : 0.25); }, 0) - (R.ab(att).customSafe ? 0 : value(att) * 0.8);
        risk = 0;
      }
      if (R.ab(att).randomTarget && a.targets.length) { score /= a.targets.length; expKills /= a.targets.length; }
      var attacks = (R.ab(att).attacks || 1);
      score = score * (attacks > 1 ? 1.6 : 1) - risk + rng() * noise;
      if (!best || score > best.score) best = { score: score, cardId: a.cardId, option: a.option };
    });
    if ((!best || best.score < 0.5) && R.canSwap(state, side) && !nested) {
      var sw = bestSwap(state, side, rng);
      if (sw && (!best || sw.score > best.score)) best = sw;
    }
    return best;
  }

  // Try every switch of two of my cards; score by the best attack it sets up for my next turn.
  function bestSwap(state, side, rng, anyway) {
    var slots = state.teams[side].slots, best = null;
    for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) {
      if (!slots[i] || !slots[j]) continue;
      if (!anyway && (slots[i].isGeneral && j < 6 || slots[j].isGeneral && i < 6)) continue; // avoid pushing the General forward
      var s2 = R.turnSwap(state, side, i, j);
      if (!s2) continue;
      var sc = -1;
      if (s2.phase === 'battle') {
        s2 = R.clone(s2); s2.turn = side; s2.extra = null;
        var c = choose(s2, side, rng, true);
        sc = (c ? c.score : 0) * 0.6 - 0.5 + rng() * 0.3;
      }
      if (!best || sc > best.score) best = { score: sc, swap: [i, j] };
    }
    return best || (anyway ? null : bestSwap(state, side, rng, true));
  }

  // Hero power decision: returns args for R.usePower, or null to hold it
  function power(state, side, rng) {
    rng = rng || Math.random;
    if (!R.canUsePower(state, side)) return null;
    var hero = state.heroes[side];
    if (hero === 'executioner') {
      var best = null;
      R.executeTargets(state, side).forEach(function (id) {
        var c = R.findCard(state, id).card;
        if (!best || value(c) > value(best)) best = c;
      });
      return best && value(best) >= 10 ? { targetId: best.id } : null;
    }
    if (hero === 'priest') {
      var hurt = state.teams[side].slots.filter(function (c) { return c && (c.life < c.baseLife || (c.statuses || []).some(function (st) { return st.type !== 'buff'; })); }).length;
      return hurt >= 2 ? {} : null;
    }
    if (hero === 'warlord') return state.turnCount >= 4 && rng() < 0.35 ? {} : null;
    if (hero === 'tactician') {
      if (R.legalActions(state, side).length) return null;
      var sw = bestSwap(state, side, rng);
      return sw && sw.swap ? { a: sw.swap[0], b: sw.swap[1] } : null;
    }
    return null;
  }
  function pickHero(rng) { var k = Object.keys(R.HEROES); return k[Math.floor((rng || Math.random)() * k.length)]; }

  return { choose: choose, setNoise: setNoise, power: power, pickHero: pickHero };
})();
