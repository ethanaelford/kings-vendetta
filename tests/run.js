// Run: node tests/run.js   (no dependencies)
global.KV_CONFIG = require('../config.js');
global.KV_CARDS = require('../js/cards.data.js');
global.KV_ABILITIES = require('../js/abilities.js');
var R = require('../js/rules.js');
global.KV_RULES = R;

var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(a, b, msg) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + ' expected ' + B + ' got ' + A);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'assertion failed'); }

// Build slots from a 12-char string: letters = card ids, '.' = empty. First 6 = front row.
function team(str) {
  return { slots: str.split('').map(function (ch) { return ch === '.' ? null : { id: ch, cardKey: 'militia', life: 3, baseLife: 3, rollsToKill: 1, hitsTaken: 0, statuses: [] }; }) };
}
function show(slots) { return slots.map(function (c) { return c ? c.id : '.'; }).join(''); }
var CENTER = { ADVANCE_BACK_ROW: true, COMPACT_DIRECTION: 'center' };

console.log('compactBoard');
t('full board unchanged', function () { eq(show(R.compactBoard(team('abcdefghijkl'), CENTER).slots), 'abcdefghijkl'); });
t('one empty column in the middle (center)', function () {
  // col 2 empty -> 5 columns, centered offset floor(1/2)=0
  eq(show(R.compactBoard(team('ab.defgh.jkl'), CENTER).slots), 'abdef.ghjkl.');
});
t('one empty column, compact right', function () {
  eq(show(R.compactBoard(team('ab.defgh.jkl'), { COMPACT_DIRECTION: 'right' }).slots), '.abdef.ghjkl');
});
t('multiple empty columns (center)', function () {
  // only cols 0 and 5 alive -> placed at cols 2,3
  eq(show(R.compactBoard(team('a....fg....l'), CENTER).slots), '..af....gl..');
});
t('multiple empty columns (left)', function () {
  eq(show(R.compactBoard(team('.b.d...h.j..'), { COMPACT_DIRECTION: 'left' }).slots), 'bd....hj....');
});
t('front dead with back alive: back advances', function () {
  eq(show(R.compactBoard(team('a.cdefghijkl'), CENTER).slots), 'ahcdefg.ijkl');
});
t('front dead, advance disabled keeps back', function () {
  eq(show(R.compactBoard(team('a.cdefghijkl'), { ADVANCE_BACK_ROW: false, COMPACT_DIRECTION: 'center' }).slots), 'a.cdefghijkl');
});
t('all-empty side', function () { eq(show(R.compactBoard(team('............'), CENTER).slots), '............'); });
t('moves are reported', function () {
  var res = R.compactBoard(team('a.cdefghijkl'), CENTER);
  eq(res.moves, [{ id: 'h', from: 7, to: 1 }]);
});
t('compactBoard is pure', function () {
  var tm = team('ab.defgh.jkl'); R.compactBoard(tm, CENTER); eq(show(tm.slots), 'ab.defgh.jkl');
});

console.log('patterns (edges & gaps)');
var E = team('abcdefghijkl').slots; // enemy full
var G = team('a.c..fg.ij..').slots; // enemy with gaps
function ids(groups) { return groups.map(function (g) { return g.join(''); }); }
t('los col 0 / col 5', function () { eq(ids(R.patternGroups('los', E, 0)), ['a']); eq(ids(R.patternGroups('los', E, 5)), ['f']); });
t('los with gap falls through to back row', function () { eq(ids(R.patternGroups('los', G, 1)), []); eq(ids(R.patternGroups('los', G, 3)), ['j']); eq(ids(R.patternGroups('los', team('a.....gh....').slots, 1)), ['h']); });
t('any', function () { eq(R.patternGroups('any', G, 0).length, 6); });
t('ends', function () { eq(ids(R.patternGroups('ends', E, 0)), ['af']); eq(ids(R.patternGroups('ends', team('......g..j..').slots, 0)), ['gj']); });
t('column edges', function () { eq(ids(R.patternGroups('column', E, 0)), ['ag']); eq(ids(R.patternGroups('column', E, 5)), ['fl']); eq(ids(R.patternGroups('column', G, 4)), []); });
t('quad at edges', function () { eq(ids(R.patternGroups('quad', E, 0)), ['abgh']); eq(ids(R.patternGroups('quad', E, 5)), ['efkl']); eq(ids(R.patternGroups('quad', E, 2)), ['bchi', 'cdij']); });
t('forD at edges', function () { eq(ids(R.patternGroups('forD', E, 0)), ['a', 'b']); eq(ids(R.patternGroups('forD', E, 5)), ['e', 'f']); eq(ids(R.patternGroups('forD', G, 1)), ['a', 'c']); });
t('lean at edges', function () { eq(ids(R.patternGroups('lean', E, 0)), ['bc']); eq(ids(R.patternGroups('lean', E, 5)), ['ed']); eq(ids(R.patternGroups('lean', E, 2)), ['ba', 'de']); });
t('L at edges', function () { eq(ids(R.patternGroups('L', E, 0)), ['agh']); eq(ids(R.patternGroups('L', E, 5)), ['flk']); });
t('lema', function () { eq(ids(R.patternGroups('lema', E, 0, { lastEnemyActor: 'k' })), ['k']); eq(ids(R.patternGroups('lema', E, 0, {})), []); });
t('six at edges', function () { eq(ids(R.patternGroups('six', E, 0)), ['agbh']); eq(ids(R.patternGroups('six', E, 5)), ['ekfl']); });
t('mirror', function () { eq(ids(R.patternGroups('mirror', E, 7)), ['h']); eq(ids(R.patternGroups('mirror', G, 1)), []); });

console.log('dice');
t('7+ = 21/36', function () { eq(R.probAtLeast(7), 21 / 36); });
t('12 = 1/36', function () { eq(R.probAtLeast(12), 1 / 36); });
t('2+ = 1, 13+ = 0', function () { eq(R.probAtLeast(2), 1); eq(R.probAtLeast(13), 0); });

console.log('General rule');
function battleState(p1Keys, p2Keys) {
  var s = R.newGame({ rng: Math.random });
  ['p1', 'p2'].forEach(function (side, k) {
    var keys = k ? p2Keys : p1Keys;
    s.teams[side].slots = keys.map(function (key) { return key ? R.makeCard(key, side) : null; });
  });
  s.phase = 'battle'; s.turn = 'p1';
  return s;
}
function fixedRng(values) { var i = 0; return function () { return values[i++ % values.length]; }; }
var LOW = fixedRng([0, 0]); // dice 1,1
var HIGH = fixedRng([0.99, 0.99]); // dice 6,6
var row = function (front, back) { var a = new Array(12).fill(null); front.forEach(function (k, i) { a[i] = k; }); back.forEach(function (k, i) { a[6 + i] = k; }); return a; };

t('failed attack on General kills the attacker', function () {
  var s = battleState(row(['militia', 'militia'], ['general']), row(['general', 'militia'], ['militia']));
  var me = s.teams.p1.slots[0];
  var s2 = R.act(s, 'p1', { cardId: me.id, option: 0 }, LOW);
  ok(s2, 'action accepted');
  ok(!R.findCard(s2, me.id), 'attacker died');
  ok(R.generalOf(s2, 'p2'), 'enemy General alive');
  eq(s2.lastEvent.attackerDied, true);
});
t('General vs General exception: attacker survives a miss', function () {
  var s = battleState(row(['general', 'militia'], ['militia']), row(['general', 'militia'], ['militia']));
  var g = R.generalOf(s, 'p1');
  var s2 = R.act(s, 'p1', { cardId: g.id, option: 0 }, LOW);
  ok(R.findCard(s2, g.id), 'my General alive');
  eq(s2.lastEvent.attackerDied, false);
});
t('killing the General wins', function () {
  var s = battleState(row(['militia', 'militia'], ['general']), row(['general', 'militia'], ['militia']));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH);
  eq(s2.phase, 'over'); eq(s2.winner, 'p1');
});
t('kill causes back card to advance and turn passes', function () {
  var s = battleState(row(['militia', 'general'], ['militia']), row(['militia', 'militia'], ['front-lineman', 'general']));
  var back = s.teams.p2.slots[6];
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH);
  eq(R.rowOf(R.findCard(s2, back.id).index), 0, 'advanced to front');
  eq(s2.turn, 'p2');
});
t('Knight needs 2 hits', function () {
  var s = battleState(row(['general'], []), row(['knight'], ['general']));
  var k = s.teams.p2.slots[0];
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH);
  ok(R.findCard(s2, k.id), 'survives first hit'); eq(R.findCard(s2, k.id).card.hitsTaken, 1);
});
t('Stealth Warrior immune to Life<=6 attackers', function () {
  var s = battleState(row(['militia', 'general'], []), row(['stealth-warrior', 'general'], []));
  eq(R.getOptions(s, 'p1', s.teams.p1.slots[0].id).length, 0);
  eq(R.getOptions(s, 'p1', s.teams.p1.slots[1].id).length, 1);
});
t('Armored Warrior only dies to snake eyes', function () {
  var s = battleState(row(['minotaur', 'general'], []), row(['armored-warrior', 'general'], []));
  var aw = s.teams.p2.slots[0];
  ok(R.findCard(R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH), aw.id), 'survives 12');
  ok(!R.findCard(R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW), aw.id), 'dies to 1+1');
});
t('back-row LOS card cannot attack', function () {
  var s = battleState(row(['militia', 'general'], ['militia']), row(['militia', 'general'], []));
  eq(R.getOptions(s, 'p1', s.teams.p1.slots[6].id).length, 0);
});

console.log('tier 2/3 abilities');
t('Fire Sentinel takes its killer with it', function () {
  var s = battleState(row(['militia', 'general'], []), row(['fire-sentinel', 'general'], []));
  var att = s.teams.p1.slots[0];
  var s2 = R.act(s, 'p1', { cardId: att.id, option: 0 }, HIGH);
  ok(!R.findCard(s2, s.teams.p2.slots[0].id), 'sentinel dead'); ok(!R.findCard(s2, att.id), 'killer dead');
});
t('Hammer Dwarf dies if it kills fewer than 2', function () {
  var s = battleState(row(['general', 'hammer-dwarf'], []), row(['knight', 'titan', 'militia'], ['general']));
  var hd = s.teams.p1.slots[1];
  var s2 = R.act(s, 'p1', { cardId: hd.id, option: 0 }, HIGH); // quad: knight+titan+general? left block = cols 0,1
  ok(!R.findCard(s2, hd.id) || s2.lastEvent.rolls[0].hits.filter(function (h) { return h.killed; }).length >= 2, 'mustKill enforced');
});
t('General\'s Bodyguard protects the General', function () {
  var s = battleState(row(['catapult', 'general'], []), row(['generals-bodyguard', 'general'], []));
  var opts = R.getOptions(s, 'p1', s.teams.p1.slots[0].id);
  eq(opts.length, 1, 'only the bodyguard is targetable');
});
t('Rookie kills the General on doubles', function () {
  var s = battleState(row(['rookie', 'general'], []), row(['militia', 'general'], []));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW); // 1+1 = doubles
  eq(s2.winner, 'p1');
});
t('Royal Assassin +5 only vs the General', function () {
  var s = battleState(row(['royal-assassin', 'general'], []), row(['militia', 'general'], []));
  var ra = s.teams.p1.slots[0];
  ok(Math.abs(R.hitChance(s, ra, s.teams.p2.slots[1]).p - R.probAtLeast(6)) < 1e-9, 'vs General');
  ok(Math.abs(R.hitChance(s, ra, s.teams.p2.slots[0]).p - R.probAtLeast(3)) < 1e-9, 'vs Militia');
});
t('Spartan gains +1 per enemy kill', function () {
  var s = battleState(row(['militia', 'spartan', 'general'], []), row(['militia', 'militia', 'general'], []));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH);
  var sp = R.findCard(s2, s.teams.p1.slots[1].id).card;
  eq(sp.dmg, 1);
});

console.log('batch B: statuses & bonus attacks');
t('Ice Sentinel freezes a failed attacker (and the card behind)', function () {
  var s = battleState(row(['militia', 'general'], ['knight']), row(['ice-sentinel', 'general'], []));
  var m = s.teams.p1.slots[0], behind = s.teams.p1.slots[6];
  var s2 = R.act(s, 'p1', { cardId: m.id, option: 0 }, LOW);
  ok(R.hasStatus(R.findCard(s2, m.id).card, 'frozen'), 'attacker frozen');
  ok(R.hasStatus(R.findCard(s2, behind.id).card, 'frozen'), 'card behind frozen');
  eq(R.getOptions(s2, 'p1', m.id).length, 0);
});
t('frozen wears off after 2 owner turns', function () {
  var s = battleState(row(['militia', 'general'], []), row(['ice-sentinel', 'general'], []));
  var m = s.teams.p1.slots[0];
  s = R.act(s, 'p1', { cardId: m.id, option: 0 }, LOW);           // p1 frozen
  var p2g = R.generalOf(s, 'p2'); s.turn = 'p2';
  var acts = function (side) { return R.legalActions(s, side); };
  for (var i = 0; i < 4; i++) { var a = acts(s.turn)[0]; s = R.act(s, s.turn, { cardId: a.cardId, option: a.option }, LOW); if (s.phase !== 'battle') break; }
  var mc = R.findCard(s, m.id);
  ok(!mc || !R.hasStatus(mc.card, 'frozen'), 'thawed');
});
t('Frost Giant strikes back after surviving', function () {
  var s = battleState(row(['militia', 'general'], []), row(['frost-giant', 'general'], []));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW);
  eq(s2.turn, 'p2'); ok(s2.extra && s2.extra.cardId === s.teams.p2.slots[0].id, 'bonus for frost giant');
  eq(R.legalActions(s2, 'p2').every(function (a) { return a.cardId === s2.extra.cardId; }), true);
  var s3 = R.act(s2, 'p2', { cardId: s2.extra.cardId, option: 0 }, LOW);
  eq(s3.turn, 'p2', 'then p2 still gets its normal turn'); ok(!s3.extra);
});
t('Elf Rampager chains on kills, and can skip', function () {
  var s = battleState(row(['elf-rampager', 'general'], []), row(['militia', 'general'], ['militia']));
  var er = s.teams.p1.slots[0];
  var s2 = R.act(s, 'p1', { cardId: er.id, option: 0 }, HIGH);
  eq(s2.turn, 'p1'); ok(s2.extra, 'bonus');
  var s3 = R.skip(s2, 'p1'); eq(s3.turn, 'p2'); ok(!s3.extra);
});
t('Elf Blitz Warrior cannot kill a partial column', function () {
  var s = battleState(row(['elf-blitz-warrior', 'general'], []), row(['militia', 'general'], ['juggernaut']));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, fixedRng([0.5, 0.5])); // 4+4=8: kills militia, not juggernaut
  eq(s2.lastEvent.deaths.length, 0);
});
t('Spy kills the General instantly', function () {
  var s = battleState(row(['spy'], ['general']), row(['general'], ['militia']));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW);
  eq(s2.winner, 'p1');
});
t('Apprentice reuses the last roll', function () {
  var s = battleState(row(['apprentice', 'general'], []), row(['knight', 'general'], []));
  s.lastRoll = { raw: [6, 6], sum: 12 };
  eq(R.hitChance(s, s.teams.p1.slots[0], s.teams.p2.slots[0]).p, 1);
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW);
  eq(s2.lastEvent.rolls[0].total, 12);
});
t('Thunder Warrior debuffs and dies', function () {
  var s = battleState(row(['thunder-warrior', 'general'], []), row(['knight', 'general'], []));
  var tw = s.teams.p1.slots[0], kn = s.teams.p2.slots[0];
  var s2 = R.act(s, 'p1', { cardId: tw.id, option: 0 }, LOW);
  ok(!R.findCard(s2, tw.id), 'TW dead'); ok(R.hasStatus(R.findCard(s2, kn.id).card, 'debuff'), 'knight debuffed');
});
t('best-of-3 distribution sums to 1', function () {
  var d = R.diceDist({ cardKey: 'tactical-ninja' }), tot = 0; Object.keys(d).forEach(function (k) { tot += d[k]; });
  ok(Math.abs(tot - 1) < 1e-9);
});

console.log('batch C: companions & more');
t('Commander: adjacent allies attack with the same roll', function () {
  var s = battleState(row(['militia', 'commander', 'militia'], ['general']), row(['militia', 'militia', 'militia'], ['general']));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[1].id, option: 0 }, HIGH);
  eq(s2.lastEvent.rolls.length, 3); eq(s2.lastEvent.rolls[1].dice, s2.lastEvent.rolls[0].dice);
});
t('Ace kills every enemy with exactly the rolled Life', function () {
  var s = battleState(row(['ace', 'general'], []), row(['militia', 'militia', 'front-lineman', 'general'], []));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, fixedRng([0, 0.4])); // 1+3 = 4
  eq(s2.lastEvent.deaths.length, 1); eq(s2.lastEvent.rolls[0].total, 4);
});
t('Reviver brings back a fallen card on a kill', function () {
  var s = battleState(row(['reviver', 'general'], []), row(['militia', 'general'], []));
  s.graves.p1.push({ cardKey: 'knight', name: 'Knight', id: 'x' });
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, HIGH);
  ok(s2.teams.p1.slots.some(function (c) { return c && c.cardKey === 'knight'; }), 'knight revived');
});
t('Samurai armours its neighbour', function () {
  var s = battleState(row(['samurai', 'general'], []), row(['knight', 'general'], []));
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[0].id, option: 0 }, LOW);
  eq(R.generalOf(s2, 'p1').rollsToKill, 2);
});
t('Ent shields its ward from one hit', function () {
  var s = battleState(row(['militia', 'general'], []), row(['knight', 'general'], [null, 'ent']));
  s.turn = 'p1';
  var s2 = R.act(s, 'p1', { cardId: s.teams.p1.slots[1].id, option: 0 }, HIGH); // General attacks General
  ok(R.generalOf(s2, 'p2'), 'shield saved the General');
});

console.log('deal');
t('exactly one General per team, no duplicates (200 deals)', function () {
  for (var n = 0; n < 200; n++) {
    var s = R.newGame();
    ['p1', 'p2'].forEach(function (side) {
      var keys = s.teams[side].slots.map(function (c) { return c.cardKey; });
      eq(keys.length, 12);
      eq(keys.filter(function (k) { return k === 'general'; }).length, 1, 'generals');
      eq(new Set(keys).size, 12, 'duplicates');
      keys.forEach(function (k) { ok(R.cardDef(k).ready, k + ' not ready'); });
    });
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
