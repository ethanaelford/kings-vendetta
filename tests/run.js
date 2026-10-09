// Run: node tests/run.js   (no dependencies)
global.KV_CONFIG = require('../config.js');
global.KV_CARDS = require('../js/cards.data.js');
global.KV_ABILITIES = require('../js/abilities.js');
var R = require('../js/rules.js');

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
