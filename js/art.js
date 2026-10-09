// Card art: lookup order = custom override (images/cards/<slug>.*) -> sprite tile -> generated SVG crest.
var KV_ART = (function () {
  var spriteMap = (typeof KV_SPRITE_MAP !== 'undefined') ? KV_SPRITE_MAP : {};

  // Prefer the editable JSON when served over http(s); js/sprite-map.js covers file://.
  if (location.protocol.indexOf('http') === 0 && window.fetch) {
    fetch('images/sprites/sprite-map.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { if (m) spriteMap = m; })
      .catch(function () {});
  }

  var PALETTE = ['#8a3b2e', '#2f4d7a', '#5b6b3a', '#7a5a2f', '#5e3d6e', '#3d6e68', '#7a2f4d', '#6e6e3d'];

  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  function initials(name) {
    return name.split(/\s+/).filter(function (w) { return /^[A-Z]/.test(w); }).slice(0, 2).map(function (w) { return w[0]; }).join('') || name[0];
  }

  // Flat heraldic crest: shield + initials. Original/generic by construction.
  function svg(def) {
    var c = PALETTE[hash(def.name) % PALETTE.length];
    return '<svg viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg" class="art-svg">' +
      '<rect width="50" height="70" fill="#d9c7a0"/>' +
      '<path d="M8 10 H42 V34 C42 50 25 60 25 60 C25 60 8 50 8 34 Z" fill="' + c + '" stroke="#3a2c1a" stroke-width="2"/>' +
      '<path d="M25 10 V58" stroke="#e8d9b5" stroke-width="2" opacity=".35"/>' +
      '<text x="25" y="40" text-anchor="middle" font-family="Georgia,serif" font-size="16" font-weight="bold" fill="#f3e8cc">' +
      initials(def.name) + '</text></svg>';
  }

  function src(def) {
    if (def.art) return def.art;
    var tile = spriteMap[def.name];
    if (tile) return 'images/sprites/' + tile + '.png';
    return null;
  }

  // HTML for a card's art box
  function html(def) {
    var s = src(def);
    if (s) return '<img class="art-img' + (def.art ? '' : ' pixel') + '" src="' + s + '" alt="" draggable="false" onerror="this.outerHTML=KV_ART.svgByName(\'' + def.key + '\')">';
    return svg(def);
  }

  function svgByName(key) {
    var def = KV_RULES.cardDef(key);
    return def ? svg(def) : '';
  }

  var PATTERN_ICON = {
    los: '↑', any: '✱', ends: '⇹', column: '⇈', quad: '▦', forD: '⋔', lean: '⇶', L: '↱',
    lema: '↺', general: '♛', six: '☰', mirror: '⇅', support: '✚', special: '★',
  };
  var PATTERN_TEXT = {
    los: 'Line of sight: first enemy in my column', any: 'Any enemy card', ends: 'Both ends of the exposed enemy row',
    column: 'Both enemy cards in my column', quad: '2x2 block around my LOS target', forD: 'Forward or diagonal',
    lean: 'Two cards left or right of my LOS target', L: 'L-shape: two forward, one sideways', lema: 'Last enemy that acted',
    general: 'The enemy General', six: 'The 6 cards opposite me and my neighbours', mirror: 'Enemy in the identical slot',
    support: 'Supports allies (no attack)', special: 'Special (see ability)',
  };

  return { html: html, svg: svg, svgByName: svgByName, src: src, PATTERN_ICON: PATTERN_ICON, PATTERN_TEXT: PATTERN_TEXT };
})();
