// Sends a "your turn" web push to one device. Body: { to: clientId, title, body, url }.
// Rate limited to one push per device every 20 seconds. Gone subscriptions are cleaned up.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://ethanaelford.github.io/kings-vendetta/',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const { to, title, body, url } = await req.json();
    if (typeof to !== 'string' || to.length < 8 || to.length > 40) return json({ sent: false, reason: 'bad target' }, 400);
    const { data: row } = await db.from('kv_push').select('subscription, last_sent').eq('client_id', to).maybeSingle();
    if (!row) return json({ sent: false, reason: 'no subscription' });
    if (row.last_sent && Date.now() - new Date(row.last_sent).getTime() < 20000) return json({ sent: false, reason: 'rate limited' });
    const payload = JSON.stringify({
      title: String(title ?? "King's Vendetta").slice(0, 60),
      body: String(body ?? 'Your turn!').slice(0, 140),
      url: typeof url === 'string' && url.startsWith('https://ethanaelford.github.io/') ? url : 'https://ethanaelford.github.io/kings-vendetta/',
    });
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 3600 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('kv_push').delete().eq('client_id', to);
      return json({ sent: false, reason: 'push failed ' + (code ?? '') });
    }
    await db.from('kv_push').update({ last_sent: new Date().toISOString() }).eq('client_id', to);
    return json({ sent: true });
  } catch (_e) {
    return json({ sent: false, reason: 'bad request' }, 400);
  }
});
