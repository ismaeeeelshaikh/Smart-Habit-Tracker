// Production tick for the reminder loop.
//
// The loop runs inside the API (POST /internal/dispatch). Render's free web
// services sleep when idle and cannot run a background worker, so something
// outside has to knock once a minute: this Worker's cron trigger. The knock
// also wakes the API if it was asleep. The endpoint holds a lock, so an
// overlapping or retried tick stands down instead of sending twice.

export default {
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(tick(env));
    },
};

export async function tick(env, fetchImpl = fetch) {
    if (!env.DISPATCH_URL || !env.INTERNAL_API_KEY) {
        throw new Error('DISPATCH_URL and INTERNAL_API_KEY must both be set');
    }

    const res = await fetchImpl(env.DISPATCH_URL, {
        method: 'POST',
        headers: { 'X-Internal-Key': env.INTERNAL_API_KEY },
    });
    const body = await res.text();

    // Throwing marks this cron run as failed in the Cloudflare dashboard.
    if (!res.ok) {
        throw new Error(`dispatch answered ${res.status}: ${body.slice(0, 200)}`);
    }
    console.log(`dispatch: ${body}`);
    return body;
}
