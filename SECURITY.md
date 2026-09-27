# security policy

## reporting

email **security@bosley.app** with steps to reproduce. you will get a human reply within 72 hours. please do not open a public issue for anything exploitable, and do not test against other people's accounts or data.

machine-readable contact: `/.well-known/security.txt`.

## what is in scope

- the web app (this repository) as deployed
- the supabase schema, policies and edge functions in `supabase/`
- the vercel edge middleware and headers in `middleware.ts` / `vercel.json`

## what we consider a vulnerability

- reading, changing or deleting data the signed-in user is not allowed to see or touch (row-level security bypass)
- bypassing multi-factor authentication, rate limits, reply controls, mutes or message-request settings
- executing script in another user's browser (xss), or making their browser load third-party resources
- uploading content that is served with an executable or mismatched type
- any way to obtain a service-role key, an access token, or another user's private data

## what we do not reward

- reports from automated scanners with no working proof
- missing headers on third-party domains we do not control
- rate-limit findings that require more than 1,000 requests per minute from one ip
- social engineering of the maintainers

## safe harbour

good-faith research that stays within the rules above will not lead to legal action from zorak corp. keep it to your own accounts, stop as soon as you have proof, and give us reasonable time to fix before you talk about it publicly.
