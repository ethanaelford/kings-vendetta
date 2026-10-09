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

  // ---- batch B: statuses, bonus attacks, dice ----
  'ice-sentinel': {
    // If attacker fails: attacker and the card behind it are frozen for their next 2 turns
    onFailedAttackAgainstMe: function (ctx) {
      var f = KV_RULES.findCard(ctx.state, ctx.attacker.id);
      ctx.addStatus(ctx.state, ctx.attacker, { type: 'frozen', turns: 2 });
      if (f && f.index < 6) ctx.addStatus(ctx.state, ctx.state.teams[f.side].slots[f.index + 6], { type: 'frozen', turns: 2 });
      ctx.ev.notes.push(ctx.attacker.name + ' is frozen!');
    },
  },
  'lava-guardian': {
    // If attacker fails: attacker -1 on its next roll, Lava Guardian +1 on its next roll
    onFailedAttackAgainstMe: function (ctx) {
      ctx.addStatus(ctx.state, ctx.attacker, { type: 'debuff', n: 1, turns: 1 });
      ctx.addStatus(ctx.state, ctx.target, { type: 'buff', n: 1, turns: 1 });
    },
  },
  'thunder-warrior': {
    // No roll: LOS target gets -8 on its rolls for 2 turns; Thunder Warrior dies using it
    customAction: function (ctx) {
      ctx.targets.forEach(function (t) {
        var ok = ctx.addStatus(ctx.state, t, { type: 'debuff', n: 8, turns: 2 });
        ctx.ev.notes.push(ok ? t.name + ' is thunderstruck (-8 for 2 turns)' : t.name + ' shrugs off the thunder');
      });
      ctx.ev.selfDestruct = true;
    },
    customText: 'Debuff -8 (Thunder Warrior dies)',
  },
  'elephant-mounted-warrior': {
    // If killed, the killer's Life becomes 4 for 2 turns
    onKilled: function (ctx) {
      if (ctx.addStatus(ctx.state, ctx.killer, { type: 'lifeSet', n: 4, turns: 2 })) ctx.ev.notes.push(ctx.killer.name + "'s Life drops to 4!");
    },
  },
  'venom-warrior': {
    // On kill, the dead card's neighbours have their Life halved (reset: 1 turn)
    onKill: function (ctx) {
      var me = ctx.attacker;
      me.cooldowns = me.cooldowns || {};
      if (me.cooldowns.venom) return;
      KV_RULES.neighbours(ctx.index).forEach(function (i) {
        var c = ctx.slots[i];
        if (c && !c.isGeneral && !KV_RULES.ab(c).immuneDebuffs) c.life = Math.ceil(c.life / 2);
      });
      me.cooldowns.venom = 2;
      ctx.ev.notes.push('Venom spreads: neighbours lose half their Life');
    },
  },
  'the-supplier': {
    // Doesn't attack; neighbouring allies get +2 to rolls and +1 Life
    noAttack: true,
    passiveAura: function (ctx) { return ctx.adjacent ? 2 : 0; },
    lifeAura: function () { return 1; },
  },
  'apprentice': { dice: 'last' },               // reuses the last roll made in the game
  'magma-knight': { dice: 'magma' },            // roll + 1/3 of the roll (rounded down)
  'tactical-ninja': { dice: 'best3' },          // best of 3 rolls
  'stone-golem': { lastStandWipe: true },
  'major': {
    // When killed, every card on the killer's team with the killer's Life dies (Generals excepted)
    onKilled: function (ctx) {
      var side = ctx.killer.side, life = ctx.killer.life, ids = [];
      ctx.state.teams[side].slots.forEach(function (c) { if (c && !c.isGeneral && c.life === life) ids.push(c.id); });
      if (ids.length) ctx.ev.notes.push('The Major’s curse strikes every Life-' + life + ' card');
      return { kill: ids };
    },
  },
  'dragon-ninja': { immuneDebuffs: true },
  'spy': {
    // Disguised as Militia until it acts; instantly kills the General
    autoKill: function (ctx) { return ctx.target.isGeneral; },
  },
  'frost-giant': {
    // If attacked and not killed, gets a free attack right away
    onSurvive: function (ctx) {
      if (!ctx.state.pendingExtra) ctx.state.pendingExtra = { side: ctx.target.side, cardId: ctx.target.id, reason: 'Frost Giant shrugs it off and strikes back!' };
    },
  },
  'elf-rampager': {
    onAttackResolved: function (ctx) {
      if (ctx.kills) ctx.state.pendingExtra = { side: ctx.attacker.side, cardId: ctx.attacker.id, reason: 'Elf Rampager keeps attacking!' };
    },
  },
  'light-dragon': {
    onAttackResolved: function (ctx) {
      if (ctx.kills) ctx.state.pendingExtra = { side: ctx.attacker.side, cardId: ctx.attacker.id, reason: 'Light Dragon attacks again!' };
    },
  },
  'elf-blitz-warrior': {
    allOrNothing: true, // can't kill a partial column
    onAttackResolved: function (ctx) {
      if (ctx.kills) ctx.state.pendingExtra = { side: ctx.attacker.side, cardId: ctx.attacker.id, reason: 'Elf Blitz Warrior keeps attacking!' };
    },
  },
  'hog-mounted-brute': {
    onAttackResolved: function (ctx) {
      if (ctx.kills && !ctx.isExtra) ctx.state.pendingExtra = { side: ctx.attacker.side, cardId: ctx.attacker.id, pattern: 'any', reason: 'Hog Mounted Brute earns a free attack on any card!' };
    },
  },
};
if (typeof module !== 'undefined') module.exports = KV_ABILITIES;
