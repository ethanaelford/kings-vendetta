// Card abilities, keyed by card key (kebab-case name). Pure data + functions; no DOM.
//
// Supported hooks / properties (see js/rules.js for where each is called):
//   isGeneral               - this card is the General
//   rollsRequired(card)     - successful hits needed to kill this card (default 1)
//   modifyRoll(ctx)         - returns a number added to this attacker's roll
//   canBeTargetedBy(ctx)    - false makes this card immune to ctx.attacker
//   getTargets(ctx)         - override the attack pattern; returns groups of target ids
//   dice                    - '2d6' (default) | 'oneDouble' (one die, value doubled)
//   attacks                 - number of separate rolls per action (default 1)
//   successRule             - 'atLeast' (default: roll >= life) | 'under' (roll < life)
//   onlyDiesTo              - 'snakeEyes' : only a raw 1+1 kills this card
//   anyRow                  - can attack from the back row
var KV_ABILITIES = {
  'general': { isGeneral: true },
  'knight': { rollsRequired: function () { return 2; } },
  'titan': { rollsRequired: function () { return 3; } },
  'minotaur': { modifyRoll: function () { return 1; } },
  'heavily-armored-soldier': { modifyRoll: function () { return -5; } },
  'stealth-warrior': {
    canBeTargetedBy: function (ctx) { return ctx.attacker.baseLife > 6; },
  },
  'juggernaut': { successRule: 'under' },
  'armored-warrior': { onlyDiesTo: 'snakeEyes' },
  'blade-dancer': { dice: 'oneDouble' },
  'berserker-warrior': { attacks: 2 },
  'archer': {
    anyRow: true,
    // Attack choice from column: either living enemy card in my column, front or back.
    getTargets: function (ctx) {
      var out = [];
      [ctx.col, ctx.col + 6].forEach(function (i) {
        var e = ctx.enemySlots[i];
        if (e) out.push([e.id]);
      });
      return out;
    },
  },

  // ---- tier 2/3 ----
  // Blood Hound (LUR), Cannon (Lean), Avenger (Last): pattern only, no extra ability.
  'blood-hound': {},
  'cannon': {},
  'avenger': {},
  'dwarf-blitzer': {
    // Can't be attacked by opponent Life 5+ (except the General)
    canBeTargetedBy: function (ctx) { return ctx.attacker.isGeneral || ctx.attacker.baseLife < 5; },
  },
  'royal-assassin': {
    // +5 on Royals (assumed: the General)
    modifyRoll: function (ctx) { return ctx.target && ctx.target.isGeneral ? 5 : 0; },
  },
  'rookie': { successRule: 'doubles' },          // targets the General; doubles kill it, a miss kills Rookie (General rule)
  'fallen-knight': {
    onKill: function (ctx) { ctx.attacker.life += 1; },
  },
  'spartan': {
    // +1 damage (permanent) every time an enemy card is killed
    onAnyKill: function (ctx) { ctx.card.dmg = (ctx.card.dmg || 0) + ctx.count; },
  },
  'unstable-titan': {
    onAttackResolved: function (ctx) { if (!ctx.kills) ctx.attacker.dmg = (ctx.attacker.dmg || 0) + 1; },
  },
  'elite-assasin': {
    // Auto-kill cards with lower Life than him
    autoKill: function (ctx) { return !ctx.target.isGeneral && ctx.target.life < ctx.attacker.life; },
  },
  'fire-sentinel': {
    onKilled: function () { return 'killerDies'; },
  },
  'wizard': {
    // LOS target plus every card in that row with the same Life (one roll)
    getTargets: function (ctx) {
      var los = ctx.patternGroups('los', ctx.enemySlots, ctx.index)[0];
      if (!los) return [];
      var idx = ctx.enemySlots.findIndex(function (c) { return c && c.id === los[0]; });
      var life = ctx.enemySlots[idx].life, r0 = idx < 6 ? 0 : 6, g = [los[0]];
      for (var i = r0; i < r0 + 6; i++) { var c = ctx.enemySlots[i]; if (c && c.id !== los[0] && c.life === life) g.push(c.id); }
      return [g];
    },
  },
  'horse-mounted-troop': {
    // Jumps a card: attacks the card in its column and the card behind it, from either row
    anyRow: true,
    getTargets: function (ctx) { return ctx.patternGroups('column', ctx.enemySlots, ctx.col); },
  },
  'hammer-dwarf': { mustKill: 2 },
  'ranger': { mustKill: 2 },
  'generals-bodyguard': {
    protects: function (ctx) { return ctx.target.isGeneral; },
  },
  'wisp': {
    // +1 per Wisp-family card on my side (including itself)
    modifyRoll: function (ctx) {
      return ctx.state.teams[ctx.attacker.side].slots.filter(function (c) { return c && /wisp/.test(c.cardKey); }).length;
    },
  },
  'neon-wisp': {
    passiveAura: function (ctx) { return /wisp/.test(ctx.attacker.cardKey) ? 2 : 0; },
  },
};
if (typeof module !== 'undefined') module.exports = KV_ABILITIES;
