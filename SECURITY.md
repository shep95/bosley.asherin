# security policy

## reporting

email **security@bosley.app** with steps to reproduce. you will get a human reply within 72 hours. please do not open a public issue for anything exploitable.

machine-readable contact: `/.well-known/security.txt`.

## what is in scope

- the site as deployed at bosley.asherin.com (this repository)
- the comment api: `src/pages/api/*` and `src/lib/server/*`
- the edge guard and headers: `src/middleware.ts`, `vercel.json`

## what we consider a vulnerability

- running script in a visitor's browser (xss), or making it load third-party resources
- posting a comment without solving the proof-of-work, or replaying one
- removing, editing or impersonating someone else's comment (forging a signed ◆ mark)
- reading anything that identifies a commenter (ip, device, location) from what we store
- writing outside `comments/<post>/` in blob storage, or to a post that doesn't exist
- an image on the site that still carries exif, gps, xmp or iptc data

## what we do not reward

- reports from automated scanners with no working proof
- rate-limit findings that need more than 1,000 requests per minute from one address
- vercel's own platform logging, which is outside this code (see /privacy)

## safe harbour

good-faith research within these rules will not lead to legal action from zorak corp. stop as soon as you have proof, and give us reasonable time to fix before you talk about it publicly.
