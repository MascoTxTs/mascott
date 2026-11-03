# Digital twin deployment

The approved public profile is in `supabase/functions/twin/profile.mjs`. Private review notes are never imported. No model fine-tuning is performed.

## Deploy backend first

1. Supabase SQL Editor: run `supabase/migrations/202611020001_twin_quota.sql` once. It creates isolated quota tables and a service-role-only RPC. It does not alter feedback data.
2. Edge Functions > Secrets: keep `DEEPSEEK_API_KEY`; add `TWIN_HASH_SECRET` (random 32+ byte secret). Do not put either in browser variables or Git. Optional `ALLOWED_ORIGIN` defaults to `https://mascotxts.github.io`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function.
3. Local terminal: `npx supabase login`, then `npx supabase functions deploy twin --project-ref YOUR_PROJECT_REF --no-verify-jwt`. Authentication is intentionally anonymous; the function enforces CORS, bounded input and server-side atomic quotas. CORS is not authentication.
4. Test on the real Supabase gateway before releasing the frontend. If no IP header is present, requests fail closed. Gateway-provided IP headers must be verified; anonymity, shared IPs, VPNs and client IDs cannot establish a real person's identity. Global caps do not rely on identity.
5. Deploy Astro to Pages only after backend verification. `PUBLIC_SUPABASE_URL` must point to the same project as the function.

## Caps

Browser 10/day; IP 20/day; global 100/day and 1000/month, Asia/Shanghai. Both browser/IP have 10-second cooldown. A global lock serializes reservations; denied/error reservations cannot call DeepSeek. Paid attempts never refunded or automatically retried. Rotating browser/IP cannot reset global caps.
Question <=300 UTF-16 code units; <=2 prior user/assistant pairs; prior assistant <=1000 units; request body <=16000 bytes. Output max_tokens=512, deepseek-flash, thinking disabled, no search or tools. Costs are bounded by request/context limits, not a guaranteed RMB amount. Platform hosting costs are separate.

Only HMAC identifiers, count and last-use timestamp are stored. No chat text or raw IP is written by this application; hosting/provider logs have their own policies. Counters older than the previous month are deleted during allowed reservations.

Emergency stop (SQL Editor): `update public.twin_control set enabled=false where id=true;` Already-started requests can finish. Re-enable with true. To stop all use of a leaked key, revoke it at DeepSeek.

## Validation

Run `node --test tests/twin.test.mjs` and `npm run build`. Mocked tests make no paid API calls. A live gateway/API smoke test is still required after deployment.

Local SQL regression: `npm install --prefix .private-twin/test-runtime --no-save --ignore-scripts @electric-sql/pglite`, then `node tests/twin-sql.local.mjs`. This is an isolated PostgreSQL test and does not touch production.

## Verification record — 2026-11-02

- Astro build: passed (11 routes).
- Backend mocked tests: 6 passed; SQL tests passed (caps, cooldown, concurrent reservations, stop switch, anon permissions).
- Headless Edge: Chinese/English API UI, safe text rendering, history/reset, quota failure input preservation, 390px width passed.
- Quota migration, hash secret and function deployed to the existing Supabase project.
- Live anonymous gateway reaches the function and quota RPC; DeepSeek returned HTTP 401. Owner must correct DEEPSEEK_API_KEY before frontend release.
- No frontend push/deployment performed for this integration yet. Two smoke attempts were reserved and not refunded.

Follow-up: owner updated Secret; two additional smoke attempts still returned upstream 401, including after trimming key whitespace and redeploying the function. Four smoke reservations total; no successful model response. Frontend remains unreleased.

## Verification record — 2026-11-03

- Updated provider secret now works: one live smoke request returned HTTP 200 with approved anime/game facts and remaining=9.
- Reran all 6 mocked backend tests and isolated PostgreSQL quota regression successfully. Astro built all 11 routes.
- Redeployed current function source successfully. No secret values or private review files are included in the release.
