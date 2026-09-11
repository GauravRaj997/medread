# MedRead

MedRead is a public prescription-reading tool with a separate private admin app for support and upload review.

## Apps

- `apps/web` — public upload, result, and contact experience.
- `apps/admin` — protected support inbox and flagged-upload review queue.
- `apps/worker` — OCR, extraction, export, and expiry cleanup jobs.

## Administrator password

The admin app reads `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and
`ADMIN_SESSION_SECRET` from the environment. Do not set a plaintext
administrator password. Generate an `ADMIN_PASSWORD_HASH` with:

~~~bash
node -e 'const c=require("crypto"),p=process.argv[1],s=c.randomBytes(16).toString("hex");console.log(s+":"+c.scryptSync(p,s,64).toString("hex"))' 'choose-a-long-password'
~~~

Put the command's output into `ADMIN_PASSWORD_HASH`.
