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
// Ranged cards (for Ranged / Melee Expert). Everything else except the General counts as melee.
var KV_RANGED = { 'archer': 1, 'catapult': 1, 'stationary-crossbow-soldier': 1, 'cannon': 1, 'ranger': 1, 'iron-giant': 1, 'bomb-expert': 1 };

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
  // ---- batch C: companions, poison, marks ----
  'commander': {
    // Both adjacent (same-row) allies attack their own LOS targets with the Commander's roll
    companions: function (ctx) {
      var out = [], col = ctx.index % 6, r0 = ctx.index < 6 ? 0 : 6;
      [col - 1, col + 1].forEach(function (c) {
        if (c < 0 || c > 5) return;
        var ally = ctx.slots[r0 + c];
        if (!ally) return;
        var g = ctx.patternGroups('los', ctx.enemySlots, c)[0];
        if (g) out.push({ cardId: ally.id, targets: g });
      });
      return out;
    },
  },
  'captain': {
    // All Horse Mounted Troops attack with his roll (their column); if none, one adjacent ally attacks its LOS
    companions: function (ctx) {
      var out = [];
      ctx.slots.forEach(function (c, i) {
        if (c && c.cardKey === 'horse-mounted-troop') {
          var g = ctx.patternGroups('column', ctx.enemySlots, i % 6)[0];
          if (g) out.push({ cardId: c.id, targets: g });
        }
      });
      if (out.length) return out;
      var col = ctx.index % 6, r0 = ctx.index < 6 ? 0 : 6;
      [col - 1, col + 1].some(function (c) {
        var ally = c >= 0 && c <= 5 && ctx.slots[r0 + c];
        var g = ally && ctx.patternGroups('los', ctx.enemySlots, c)[0];
        if (g) out.push({ cardId: ally.id, targets: g });
        return !!g;
      });
      return out;
    },
  },
  'tactical-warrior': {
    // The card behind him attacks the card behind his opponent, with his roll
    companions: function (ctx) {
      if (ctx.index >= 6) return [];
      var behind = ctx.slots[ctx.index + 6], foe = ctx.enemySlots[ctx.index + 6];
      return behind && foe ? [{ cardId: behind.id, targets: [foe.id] }] : [];
    },
  },
  'admiral': {
    // Whole row attacks: every other card in his row attacks its LOS target with his roll
    companions: function (ctx) {
      var out = [], r0 = ctx.index < 6 ? 0 : 6;
      for (var c = 0; c < 6; c++) {
        var ally = ctx.slots[r0 + c];
        if (!ally || ally.id === ctx.attacker.id) continue;
        var g = ctx.patternGroups('los', ctx.enemySlots, c)[0];
        if (g) out.push({ cardId: ally.id, targets: g });
      }
      return out;
    },
  },
  'wisp-captain': {
    // All wisps attack their identical slot, with his roll (keeping their own bonuses)
    companions: function (ctx) {
      var out = [];
      ctx.slots.forEach(function (c, i) {
        if (c && c.id !== ctx.attacker.id && /wisp/.test(c.cardKey) && ctx.enemySlots[i]) out.push({ cardId: c.id, targets: [ctx.enemySlots[i].id] });
      });
      return out;
    },
  },
  'wolf-mounted-dwarf': {
    // Chooses: attack twice, or +2. Auto-picks whichever has the better kill chance.
    plan: function (ctx) {
      var t = ctx.targets[0];
      if (!t) return {};
      var p0 = KV_RULES.hitChance(ctx.state, ctx.attacker, t).p;
      ctx.attacker.tmpBonus = 2;
      var p2 = KV_RULES.hitChance(ctx.state, ctx.attacker, t).p;
      ctx.attacker.tmpBonus = 0;
      var twice = 1 - (1 - p0) * (1 - p0);
      return twice >= p2 ? { attacks: 2, note: 'Wolf Mounted Dwarf attacks twice' } : { bonus: 2, note: 'Wolf Mounted Dwarf charges (+2)' };
    },
  },
  'hydra': {
    // 3 hits to kill, +2 damage; whoever fails against it (or survives it) is poisoned for 3 turns
    rollsRequired: function () { return 3; },
    modifyRoll: function () { return 2; },
    onFailedAttackAgainstMe: function (ctx) { ctx.addStatus(ctx.state, ctx.attacker, { type: 'poison', n: 1, turns: 3 }); },
    onAttackResolved: function (ctx) {
      ctx.survivors.forEach(function (id) { var f = KV_RULES.findCard(ctx.state, id); if (f) ctx.addStatus(ctx.state, f.card, { type: 'poison', n: 1, turns: 3 }); });
    },
  },
  'lightning-mage': {
    // The target's neighbours are poisoned (-1 Life per turn, 3 turns)
    onAttackResolved: function (ctx) {
      var seen = {};
      ctx.targets.forEach(function (id) {
        var f = KV_RULES.findCard(ctx.state, id);
        var slots = ctx.state.teams[KV_RULES.other(ctx.attacker.side)].slots;
        var idx = f ? f.index : -1;
        if (idx < 0) return;
        KV_RULES.neighbours(idx).forEach(function (i) {
          var c = slots[i];
          if (c && !seen[c.id]) { seen[c.id] = 1; ctx.addStatus(ctx.state, c, { type: 'poison', n: 1, turns: 3 }); }
        });
      });
    },
  },
  'fire-striker': {
    // Flame debuff: a surviving target gets -2 on its rolls for 2 turns
    onAttackResolved: function (ctx) {
      ctx.survivors.forEach(function (id) { var f = KV_RULES.findCard(ctx.state, id); if (f) ctx.addStatus(ctx.state, f.card, { type: 'debuff', n: 2, turns: 2 }); });
    },
  },
  'chemical-warfare-warrior': {
    // No roll: any enemy card is poisoned and paralyzed for 3 turns
    customAction: function (ctx) {
      ctx.targets.forEach(function (t) {
        var a = ctx.addStatus(ctx.state, t, { type: 'poison', n: 1, turns: 3 });
        var b = ctx.addStatus(ctx.state, t, { type: 'frozen', turns: 3 });
        ctx.ev.notes.push(a || b ? t.name + ' is poisoned and paralyzed!' : t.name + ' is immune');
      });
    },
    customSafe: true,
    customText: 'Poison + paralyze (3 turns)',
  },
  'redstone-warrior': {
    // The third time it attacks the same card, that card dies
    autoKill: function (ctx) { return !ctx.target.isGeneral && (ctx.target.redstone || 0) >= 2; },
    onAttackResolved: function (ctx) {
      ctx.survivors.forEach(function (id) { var f = KV_RULES.findCard(ctx.state, id); if (f) f.card.redstone = (f.card.redstone || 0) + 1; });
    },
  },
  'peasant-mob': { dice: 'mob' },
  'bomb-expert': {
    // Attacks any card + every card it previously failed to kill (marks last 3 turns)
    anyRow: true,
    getTargets: function (ctx) {
      var marked = ctx.enemySlots.filter(function (c) {
        return c && (c.statuses || []).some(function (st) { return st.type === 'mark' && st.src === ctx.card.id; });
      }).map(function (c) { return c.id; });
      return ctx.enemySlots.filter(Boolean).map(function (c) {
        return [c.id].concat(marked.filter(function (id) { return id !== c.id; }));
      });
    },
    onAttackResolved: function (ctx) {
      ctx.survivors.forEach(function (id) {
        var f = KV_RULES.findCard(ctx.state, id);
        if (f) ctx.addStatus(ctx.state, f.card, { type: 'mark', src: ctx.attacker.id, turns: 3 });
      });
    },
  },
  'ace': {
    // Rolls a number: every enemy card (except the General) with exactly that Life dies
    anyRow: true,
    successRule: 'exact',
    getTargets: function (ctx) {
      var g = ctx.enemySlots.filter(function (c) { return c && !c.isGeneral; }).map(function (c) { return c.id; });
      return g.length ? [g] : [];
    },
  },
  'fire-sprite': {
    // Cards with damage bonuses can't attack it
    canBeTargetedBy: function (ctx) {
      var a = KV_RULES.ab(ctx.attacker);
      return !(a.modifyRoll || a.dice === 'magma' || ctx.attacker.dmg);
    },
  },
  'samurai': {
    // After attacking, armours one neighbouring ally (+1 hit needed to kill it), General first. Permanent.
    onAttackResolved: function (ctx) {
      var f = KV_RULES.findCard(ctx.state, ctx.attacker.id);
      if (!f) return;
      var slots = ctx.state.teams[f.side].slots, best = null;
      KV_RULES.neighbours(f.index).forEach(function (i) {
        var c = slots[i];
        if (!c || c.armored) return;
        if (!best || (c.isGeneral && !best.isGeneral) || (!best.isGeneral && c.life > best.life)) best = c;
      });
      if (best) { best.armored = true; best.rollsToKill += 1; ctx.ev.notes.push('Samurai armours ' + best.name + ' (+1 hit to kill)'); }
    },
  },
  'ent': { shieldsNeighbour: true },
  'reviver': {
    // On kill, revives the best card from its graveyard into an empty slot
    onKill: function (ctx) {
      var side = ctx.attacker.side, graves = ctx.state.graves[side];
      var best = -1;
      graves.forEach(function (g, i) {
        var d = KV_RULES.cardDef(g.cardKey);
        if (g.cardKey === 'general' || !d.ready) return;
        if (best < 0 || (d.life || 0) > (KV_RULES.cardDef(graves[best].cardKey).life || 0)) best = i;
      });
      if (best < 0) return;
      var slots = ctx.state.teams[side].slots, spot = -1;
      for (var c = 0; c < 6 && spot < 0; c++) if (slots[c] && !slots[c + 6]) spot = c + 6;
      for (var c2 = 0; c2 < 6 && spot < 0; c2++) if (!slots[c2] && !slots[c2 + 6]) spot = c2;
      if (spot < 0) return;
      var g = graves.splice(best, 1)[0];
      slots[spot] = KV_RULES.makeCard(g.cardKey, side);
      ctx.ev.notes.push('Reviver raises ' + g.name + ' from the grave!');
    },
  },
  // ---- batch D: movement, cleanse, experts, gambles ----
  'foot-soldier': {
    // Switch places with a neighbouring ally, once per game (uses the turn)
    extraOptions: function (ctx) {
      if (ctx.card.usesLeft === 0) return [];
      return KV_RULES.neighbours(ctx.index).filter(function (i) { return ctx.mySlots[i]; })
        .map(function (i) { return { targets: [ctx.mySlots[i].id], mode: 'swapAlly', own: true, label: 'Switch' }; });
    },
  },
  'medic': {
    // Instead of attacking, cleanse an ally of debuffs, freeze, poison and marks
    extraOptions: function (ctx) {
      var BAD = { frozen: 1, debuff: 1, lifeSet: 1, poison: 1, mark: 1 };
      return ctx.mySlots.filter(function (c) { return c && (c.statuses || []).some(function (st) { return BAD[st.type]; }); })
        .map(function (c) { return { targets: [c.id], mode: 'cleanse', own: true, label: 'Cleanse' }; });
    },
  },
  'lightning-ninja': {
    // Moves (to any column where it has a front-row ally) then attacks that column's LOS target
    extraOptions: function (ctx) {
      if (ctx.row !== 0) return [];
      var out = [];
      for (var c = 0; c < 6; c++) {
        if (c === ctx.col || !ctx.mySlots[c]) continue;
        var li = ctx.losIndex(ctx.enemySlots, c);
        if (li >= 0) out.push({ targets: [ctx.enemySlots[li].id], mode: 'ninja', label: 'Move + attack' });
      }
      return out;
    },
  },
  'eagle-warrior': {
    // Once per game: pull any enemy card (not the General) into its line of sight, then attack it
    extraOptions: function (ctx) {
      if (ctx.card.usesLeft === 0 || ctx.row !== 0) return [];
      var li = ctx.losIndex(ctx.enemySlots, ctx.col);
      if (li < 0) return [];
      return ctx.enemySlots.filter(function (c, i) { return c && i !== li && !c.isGeneral; })
        .map(function (c) { return { targets: [c.id], mode: 'eagle', label: 'Pull + attack' }; });
    },
  },
  'unstable-bomb-expert': {
    // Normal LOS attack, or "Hail Mary": roll exactly 7 to win the game - anything else loses it
    extraOptions: function (ctx) {
      var g = ctx.enemySlots.filter(function (c) { return c && c.isGeneral; })[0];
      return g ? [{ targets: [g.id], mode: 'hailMary', label: 'Hail Mary' }] : [];
    },
  },
  'cobalt-knight': {
    // LOS target plus every enemy card whose Life is the LOS target's Life + 1 (one roll)
    getTargets: function (ctx) {
      var los = ctx.patternGroups('los', ctx.enemySlots, ctx.index)[0];
      if (!los) return [];
      var t = ctx.enemySlots.filter(function (c) { return c && c.id === los[0]; })[0];
      var g = [t.id];
      ctx.enemySlots.forEach(function (c) { if (c && c.id !== t.id && c.life === t.life + 1) g.push(c.id); });
      return [g];
    },
  },
  'corrupt-commander': {
    // Attacks the 6 opposite cards; touching allies join with their own rolls, without their powers
    companions: function (ctx) {
      var g = ctx.patternGroups('six', ctx.enemySlots, ctx.index % 6)[0];
      if (!g) return [];
      return KV_RULES.neighbours(ctx.index).filter(function (i) { return ctx.slots[i]; })
        .map(function (i) { return { cardId: ctx.slots[i].id, targets: g, ownRoll: true, powerless: true }; });
    },
  },
  'ranged-expert': {
    // Ranged allies: +1 Life, +3 damage, attack twice
    teamAura: function (ctx) { return KV_RANGED[ctx.card.cardKey] ? { life: 1, dmg: 3, attacks: 1 } : null; },
  },
  'melee-expert': {
    // Melee allies: +3 Life, +1 damage, must be hit twice
    teamAura: function (ctx) {
      var k = ctx.card.cardKey;
      return !KV_RANGED[k] && !ctx.card.isGeneral && !/expert/.test(k) ? { life: 3, dmg: 1, hits: 1 } : null;
    },
  },
  // ---- batch E ----
  'joker': {
    // If it wasn't attacked during the enemy's last turn, it gets a free attack on any card after its roll
    onAttackResolved: function (ctx) {
      var me = ctx.attacker;
      if (ctx.isExtra || ctx.state.pendingExtra) return;
      if (me.lastTargetedTurn == null || me.lastTargetedTurn < ctx.state.turnCount - 1) {
        ctx.state.pendingExtra = { side: me.side, cardId: me.id, pattern: 'any', reason: 'Joker was left alone - free attack on any card!' };
      }
    },
  },
  'unskilled-warrior': {
    // Rolls against a random enemy card (not the General)
    anyRow: true,
    randomTarget: true,
    getTargets: function (ctx) {
      var g = ctx.enemySlots.filter(function (c) { return c && !c.isGeneral; }).map(function (c) { return c.id; });
      return g.length ? [g] : [];
    },
  },
  'the-manipulator': {
    // Once per game: pick any enemy card - the opponent must use that card on their next turn (or lose the turn)
    extraOptions: function (ctx) {
      if (ctx.card.usesLeft === 0) return [];
      return ctx.enemySlots.filter(Boolean).map(function (c) { return { targets: [c.id], mode: 'manipulate', label: 'Manipulate' }; });
    },
  },
  'dragon-tamer': {
    // No roll: marks an enemy card (not the General) for Destruction. It is destroyed at the end of its owner's
    // next turn unless they kill the Dragon Tamer first.
    customAction: function (ctx) {
      ctx.targets.forEach(function (t) {
        if (t.isGeneral) { ctx.ev.notes.push('The General cannot be marked'); return; }
        var ok = ctx.addStatus(ctx.state, t, { type: 'doom', src: ctx.attacker.id, turns: 1 });
        ctx.ev.notes.push(ok ? t.name + ' is marked for Destruction! Kill the Dragon Tamer to save it.' : t.name + ' is immune');
      });
    },
    customSafe: true,
    customText: 'Mark for Destruction',
    canMark: function (t) { return !t.isGeneral; },
  },
  'frost-brute': {
    // An attack that rolls exactly its Life is reflected: it survives and strikes back
    reflectOnExact: true,
  },
  'stone-monster': {
    // On kill, every enemy card with lower Life than the victim has its Life halved (not the General)
    onKill: function (ctx) {
      var v = ctx.target.life, n = 0;
      ctx.slots.forEach(function (c) {
        if (c && !c.isGeneral && c.life < v && !KV_RULES.ab(c).immuneDebuffs) { c.life = Math.max(2, Math.ceil(c.life / 2)); n++; }
      });
      if (n) ctx.ev.notes.push('Stone Monster shatters ' + n + ' weaker card' + (n > 1 ? 's' : ''));
    },
  },
  'tactical-alchemist': {
    // On kill, brews +1 Life and +1 damage for itself
    onKill: function (ctx) { ctx.attacker.life += 1; ctx.attacker.dmg = (ctx.attacker.dmg || 0) + 1; },
  },
  'guardian': {
    // While alive, no other card on its team can be attacked
    protects: function () { return true; },
  },
  // ---- batch F: charges, summons, recruits ----
  'attack-wagon': {
    // Attack normally, or shove any enemy card (not the General) into its line of sight, switching it with the card there
    extraOptions: function (ctx) {
      if (ctx.row !== 0) return [];
      var li = ctx.losIndex(ctx.enemySlots, ctx.col);
      if (li < 0) return [];
      return ctx.enemySlots.filter(function (c, i) { return c && i !== li && !c.isGeneral; })
        .map(function (c) { return { targets: [c.id], mode: 'wagonSwitch', label: 'Switch' }; });
    },
  },
  'centurion': {
    // Once per game: call 2 random troops from the deck (cards never dealt to you) into empty slots
    extraOptions: function (ctx) {
      if (ctx.card.usesLeft === 0 || KV_RULES.emptySlot(ctx.mySlots) < 0 || !KV_RULES.deckFor(ctx.state, ctx.card.side).length) return [];
      return [{ targets: [ctx.card.id], mode: 'summon', own: true, self: true, label: 'Call 2 troops' }];
    },
  },
  'field-marshall': {
    // Uses its turn to recruit an enemy card (not the General) into one of its empty slots
    extraOptions: function (ctx) {
      if (KV_RULES.emptySlot(ctx.mySlots) < 0) return [];
      return ctx.enemySlots.filter(function (c) { return c && !c.isGeneral; })
        .map(function (c) { return { targets: [c.id], mode: 'steal', label: 'Recruit' }; });
    },
  },
  'phoenix': {
    // On a roll of 7: draws 3 random cards, picks one, and every matching enemy card dies
    onAttackResolved: function (ctx) {
      var r = ctx.ev.rolls[0];
      if (!r || r.dice.length !== 2 || r.dice[0] + r.dice[1] !== 7) return;
      var pool = KV_RULES.readyPool().slice(), picks = [];
      for (var i = 0; i < 3 && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      var enemy = ctx.state.teams[KV_RULES.other(ctx.attacker.side)].slots;
      var best = null;
      picks.forEach(function (k) {
        var hit = enemy.filter(function (c) { return c && c.cardKey === k; })[0];
        if (hit && (!best || hit.life > best.life)) best = hit;
      });
      var names = picks.map(function (k) { return KV_RULES.cardDef(k).name; }).join(', ');
      if (best) {
        ctx.ev.notes.push('Phoenix rises! Drew ' + names + ' - ' + best.name + ' burns!');
        ctx.ev.extraKills = (ctx.ev.extraKills || []).concat(best.id);
      } else ctx.ev.notes.push('Phoenix rises! Drew ' + names + ' - no match');
    },
  },
  'kings-knight': {
    // Charges for two turns (doing nothing), then rolls once: every enemy card with Life <= roll dies
    anyRow: true,
    init: function (card) { card.charges = 0; },
    getTargets: function (ctx) {
      if ((ctx.card.charges || 0) < 2) return [];
      var g = ctx.enemySlots.filter(Boolean).map(function (c) { return c.id; });
      return g.length ? [g] : [];
    },
    extraOptions: function (ctx) {
      return (ctx.card.charges || 0) < 2 ? [{ targets: [ctx.card.id], mode: 'charge', own: true, self: true, label: 'Charge' }] : [];
    },
    onAttackResolved: function (ctx) { if (ctx.ev.rolls.length) ctx.attacker.charges = 0; },
  },
  'general-s-guard': {
    // If it dies, its General has 4 turns to make a kill - then it is resurrected
    onKilled: function (ctx) {
      ctx.state.guardPending = ctx.state.guardPending || {};
      ctx.state.guardPending[ctx.target.side] = { turns: 4, key: ctx.target.cardKey };
      ctx.ev.notes.push("General's Guard falls - his General has 4 turns to avenge him");
    },
  },
  'bounty-hunter': {
    // Infinite Life (can't be targeted), but must kill a card every 4 turns or it leaves the field
    fixedLife: 99,
    lifeLabel: '∞',
    init: function (card) { card.bounty = 4; },
    canBeTargetedBy: function () { return false; },
    getTargets: function (ctx) { return ctx.patternGroups('los', ctx.enemySlots, ctx.index); },
    onAttackResolved: function (ctx) { if (ctx.kills) ctx.attacker.bounty = 5; },
  },
  'hog-mounted-brute': {
    onAttackResolved: function (ctx) {
      if (ctx.kills && !ctx.isExtra) ctx.state.pendingExtra = { side: ctx.attacker.side, cardId: ctx.attacker.id, pattern: 'any', reason: 'Hog Mounted Brute earns a free attack on any card!' };
    },
  },
};
if (typeof module !== 'undefined') { module.exports = KV_ABILITIES; global.KV_RANGED = KV_RANGED; }
