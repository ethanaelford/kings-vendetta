// Stress test: play many full AI-vs-AI games through the engine. Run: node tests/sim.js
global.KV_CONFIG = require('../config.js');
global.KV_CARDS = require('../js/cards.data.js');
global.KV_ABILITIES = require('../js/abilities.js');
global.KV_RULES = require('../js/rules.js');
var src = require('fs').readFileSync(__dirname + '/../js/ai.js', 'utf8');
var KV_AI = new Function('KV_RULES', src + '; return KV_AI;')(global.KV_RULES);
var R = global.KV_RULES;
var N = +process.argv[2] || 300, res = { p1: 0, p2: 0, draw: 0 }, turns = 0, maxT = 0;
for (var g = 0; g < N; g++) {
  var s = R.newGame();
  s = R.setReady(s, 'p1'); s = R.setReady(s, 'p2');
  var n = 0;
  while (s.phase === 'battle' && n < 500) {
    var c = KV_AI.choose(s, s.turn);
    if (!c) { console.log('turn', s.turn, 'extra', JSON.stringify(s.extra), 'legal', R.legalActions(s, s.turn).length, s.log.slice(-3)); if (s.extra) { s = R.skip(s, s.turn); continue; } throw new Error('no choice but battle continues'); }
    var nx = R.act(s, s.turn, { cardId: c.cardId, option: c.option });
    if (!nx) throw new Error('illegal action chosen');
    s = nx; n++;
  }
  if (s.phase !== 'over') { ['p1','p2'].forEach(function(sd){ console.log(sd, s.teams[sd].slots.map(function(c){return c?c.cardKey+'('+c.life+')':'.';}).join(' ')); }); console.log(s.log.slice(-4)); throw new Error('game did not finish in 500 turns'); }
  res[s.winner]++; turns += n; maxT = Math.max(maxT, n);
}
console.log(N + ' games ok', res, 'avg turns', (turns / N).toFixed(1), 'max', maxT);
