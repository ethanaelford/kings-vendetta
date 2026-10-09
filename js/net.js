// Online 1v1 over Supabase Realtime (broadcast + presence). No tables, anon key only.
// Host-authoritative: host runs rules + dice, guest sends intents.
var KV_NET = (function () {
  var client = null, channel = null, opts = null, status = 'idle', retryTimer = null, wantOpen = false;

  function available() {
    return !!(window.supabase && KV_CONFIG.SUPABASE_URL && KV_CONFIG.SUPABASE_ANON_KEY);
  }

  function setStatus(s) { status = s; if (opts && opts.onStatus) opts.onStatus(s); }

  function presenceUpdate() {
    if (!channel || !opts) return;
    var st = channel.presenceState();
    var otherRole = opts.role === 'host' ? 'guest' : 'host';
    var others = st[otherRole] || [];
    opts.onPresence && opts.onPresence(!!others.length, others[0] && others[0].name, others);
  }

  function subscribe() {
    if (!client) client = KV_SB();
    if (channel) { try { client.removeChannel(channel); } catch (e) {} }
    setStatus('connecting');
    var ch = client.channel('kv-room-' + opts.room, {
      config: { broadcast: { self: false, ack: false }, presence: { key: opts.role } },
    });
    channel = ch;
    ch.on('broadcast', { event: 'msg' }, function (m) { if (ch === channel) opts.onMessage(m.payload); })
      .on('presence', { event: 'sync' }, function () { if (ch === channel) presenceUpdate(); })
      .on('presence', { event: 'join' }, function () { if (ch === channel) presenceUpdate(); })
      .on('presence', { event: 'leave' }, function () { if (ch === channel) presenceUpdate(); })
      .subscribe(function (s) {
        if (ch !== channel) return;
        if (s === 'SUBSCRIBED') {
          setStatus('online');
          ch.track({ name: opts.name, role: opts.role, clientId: opts.clientId, t: Date.now() });
          opts.onOpen && opts.onOpen();
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          setStatus('offline');
          scheduleRetry();
        }
      });
  }

  function scheduleRetry() {
    if (!wantOpen || retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; if (wantOpen && status !== 'online') subscribe(); }, 2000);
  }

  function connect(o) {
    opts = o; wantOpen = true;
    subscribe();
  }

  // ---- ranked matchmaking: everyone searching sits in one presence channel; the two longest-waiting pair up ----
  var queueCh = null, queueOpts = null, queueJoined = 0;
  function ensureClient() {
    if (!client) client = KV_SB();
  }
  function queue(o) {
    ensureClient();
    leaveQueue();
    queueOpts = o; queueJoined = Date.now();
    var ch = client.channel('kv-matchmaking', { config: { broadcast: { self: false }, presence: { key: o.clientId } } });
    queueCh = ch;
    function evaluate() {
      if (ch !== queueCh) return;
      var st = ch.presenceState(), list = [];
      Object.keys(st).forEach(function (k) { if (st[k][0]) list.push(st[k][0]); });
      list.sort(function (a, b) { return a.t - b.t || (a.clientId < b.clientId ? -1 : 1); });
      o.onCount && o.onCount(list.length);
      var i = list.findIndex(function (m) { return m.clientId === o.clientId; });
      if (i < 0) return;
      var partner = list[i % 2 === 0 ? i + 1 : i - 1];
      if (partner && i % 2 === 0 && !queueOpts.sent) {
        // I waited longer: I host and invite the partner
        queueOpts.sent = true;
        var room = o.makeRoom();
        ch.send({ type: 'broadcast', event: 'match', payload: { to: partner.clientId, from: o.clientId, room: room } });
        setTimeout(function () { leaveQueue(); o.onMatch({ room: room, role: 'host', opponent: partner }); }, 400);
      }
    }
    ch.on('presence', { event: 'sync' }, evaluate)
      .on('broadcast', { event: 'match' }, function (m) {
        var p = m.payload || {};
        if (ch !== queueCh || p.to !== o.clientId) return;
        leaveQueue();
        o.onMatch({ room: p.room, role: 'guest' });
      })
      .subscribe(function (st) {
        if (st === 'SUBSCRIBED') ch.track({ clientId: o.clientId, name: o.name, rating: o.rating, t: queueJoined });
      });
  }
  function leaveQueue() {
    if (queueCh && client) { try { client.removeChannel(queueCh); } catch (e) {} }
    queueCh = null;
  }

  function send(payload) {
    if (!channel || status !== 'online') return false;
    channel.send({ type: 'broadcast', event: 'msg', payload: payload });
    return true;
  }

  function close() {
    wantOpen = false;
    if (channel && client) { try { client.removeChannel(channel); } catch (e) {} }
    channel = null; setStatus('idle');
  }

  // Phones drop sockets when the screen locks: resubscribe when visible again.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && wantOpen) {
      if (status !== 'online') subscribe();
      else opts.onOpen && opts.onOpen(); // re-sync anyway; cheap
    }
  });
  window.addEventListener('online', function () { if (wantOpen && status !== 'online') subscribe(); });

  return { available: available, connect: connect, send: send, close: close, queue: queue, leaveQueue: leaveQueue, status: function () { return status; } };
})();
