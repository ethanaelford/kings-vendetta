// "Your turn" push notifications (Web Push). On iPhone this needs iOS 16.4+ and the game added to the Home Screen.
var KV_PUSH = (function () {
  var reg = null;

  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!KV_CONFIG.VAPID_PUBLIC_KEY; }
  function standaloneIOS() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    return { ios: ios, standalone: !!standalone };
  }

  function register() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return Promise.resolve(null);
    return navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (r) { reg = r; return r; }, function () { return null; });
  }

  function keyBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function status() {
    if (!supported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return (reg ? Promise.resolve(reg) : register()).then(function (r) {
      if (!r) return 'unsupported';
      return r.pushManager.getSubscription().then(function (s) { return s ? 'on' : 'off'; });
    });
  }

  // Must be called from a tap (browsers require a user gesture for the permission prompt)
  function enable() {
    var P = KV_PROFILE.get();
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return { ok: false, reason: perm };
      return (reg ? Promise.resolve(reg) : register()).then(function (r) {
        if (!r) return { ok: false, reason: 'unsupported' };
        return navigator.serviceWorker.ready.then(function (ready) {
          return ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KV_CONFIG.VAPID_PUBLIC_KEY) });
        }).then(function (sub) {
          return KV_SB().rpc('kv_push_register', { p_client_id: P.clientId, p_secret: P.secret, p_subscription: sub.toJSON() })
            .then(function (res) { return { ok: !res.error && res.data === true, reason: res.error ? res.error.message : '' }; });
        });
      });
    }).catch(function (e) { return { ok: false, reason: String(e && e.message || e) }; });
  }

  function disable() {
    var P = KV_PROFILE.get();
    return (reg ? Promise.resolve(reg) : register()).then(function (r) {
      return r ? r.pushManager.getSubscription() : null;
    }).then(function (s) { return s ? s.unsubscribe() : null; }).then(function () {
      return KV_SB().rpc('kv_push_unregister', { p_client_id: P.clientId, p_secret: P.secret });
    }).catch(function () {});
  }

  // Ask the server to buzz another player's phone (rate-limited server-side)
  var lastSent = {};
  function notify(toClientId, title, body, url) {
    if (!toClientId || !KV_SB()) return;
    var key = toClientId + '|' + body;
    if (lastSent[key] && Date.now() - lastSent[key] < 20000) return;
    lastSent[key] = Date.now();
    KV_SB().functions.invoke('notify', { body: { to: toClientId, title: title, body: body, url: url } }).catch(function () {});
  }

  register();
  return { supported: supported, standaloneIOS: standaloneIOS, status: status, enable: enable, disable: disable, notify: notify };
})();
