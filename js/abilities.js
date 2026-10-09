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
};
if (typeof module !== 'undefined') module.exports = KV_ABILITIES;
