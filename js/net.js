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
    var other = st[otherRole] && st[otherRole][0];
    opts.onPresence && opts.onPresence(!!other, other && other.name);
  }

  function subscribe() {
    if (!client) client = window.supabase.createClient(KV_CONFIG.SUPABASE_URL, KV_CONFIG.SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } },
    });
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
          ch.track({ name: opts.name, role: opts.role, t: Date.now() });
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

  return { available: available, connect: connect, send: send, close: close, status: function () { return status; } };
})();
