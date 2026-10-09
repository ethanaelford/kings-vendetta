// Simple enemy AI: score every (card, option) by sum of P(kill) x target value, minus General-attack risk.
var KV_AI = (function () {
  var R = KV_RULES;

  function value(card) {
    if (card.isGeneral) return 100;
    return 4 + (card.baseLife || 6) + (card.rollsToKill - 1) * 3;
  }

  function choose(state, side, rng) {
    rng = rng || Math.random;
    var best = null;
    R.legalActions(state, side).forEach(function (a) {
      var att = R.findCard(state, a.cardId).card;
      var score = 0, risk = 0, expKills = 0;
      if (a.mode === 'hailMary' || a.mode === 'swapAlly' || a.mode === 'cleanse' || a.mode === 'manipulate') {
        var fixed = a.mode === 'hailMary' ? -60 : a.mode === 'cleanse' ? 4 + rng() : a.mode === 'manipulate' ? 1 + rng() : -5;
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
      score = score * (attacks > 1 ? 1.6 : 1) - risk + rng() * 1.5;
      if (!best || score > best.score) best = { score: score, cardId: a.cardId, option: a.option };
    });
    return best;
  }

  return { choose: choose };
})();
