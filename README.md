# Provisoire Yanjye

Driving-theory practice app for Rwanda's provisional licence exam. Learners practise and take timed mock exams. They get a set number of questions for free and unlock the rest by paying with MoMo, and an admin confirms each payment.

- Learner app: `/`. Installable on phones and works offline after the first visit. Kinyarwanda, English and French.
- Admin panel: `/admin`. Payments, learners, questions, import and settings.
- Needs Node.js 22.13 or newer. One package: `pg` (Postgres).

## Run it on your computer

```
npm run create-admin -- yourname     # asks for a password (10+ characters)
npm start                            # http://localhost:3000  and  http://localhost:3000/admin
```

Then, in the admin panel:

1. **Settings**: set your MoMo number, the name on the account, your WhatsApp number and the price. Check the exam rules (questions, minutes, pass mark) against the real exam.
2. **Import**: load `amategeko-yumuhanda.html` (or a link to it), choose its language, check the preview, and import. To add another language later, import that file with **Add as a translation**.

## Daily use

When a learner pays, they enter the MoMo Transaction ID. It shows up under **Payments** with a counter on the menu. Check it against your MoMo SMS, then click **Approve**. The learner is unlocked on their next refresh.

## Live updates, study mode, reviews

- **Live:** when you approve a payment, the learner's open app unlocks immediately. The admin panel shows new payments, reviews and exam results as they happen (the green "Live" dot in the menu).
- **Study mode:** every question with its correct answer and explanation, with search and topics. After paying, learners choose to study first or take the exam first. After an exam they can study the answers they got wrong.
- **Reviews:** learners who have finished a mock exam can rate the app with 1–5 stars and a comment. The app asks right after a pass, and after the second exam. Any learner who has finished an exam can also review from Account. Reviews appear on the home and payment screens once there are 3. Under **Reviews** you can hide spam or abuse. Don't hide honest criticism.

## Security

- PINs and passwords are stored as scrypt hashes, never as readable text.
- Logins lock after 5 wrong tries (15 minutes).
- Sessions are signed, HttpOnly, SameSite=Strict cookies. Blocking a learner or resetting their PIN logs them out everywhere.
- Paid questions are only sent to paid accounts; the free list is limited on the server.
- Every change request must be JSON from the same site (CSRF protection), with a strict Content-Security-Policy.
- Imports never run the uploaded file. Import links can't reach private or local addresses.
- Every admin action is logged (Dashboard → Recent admin activity).

Keep `data/` private. On your computer it holds the local database and `secret.key`. Online, the data is in Supabase, which backs it up daily.

## Put it online

Free, with no bank card: the app runs on **Render** and the data lives in **Supabase** (Postgres).
On your own computer, with no `DATABASE_URL`, the app uses a built-in Postgres (PGlite) in `data/pg` instead.

1. **Supabase:** open the project, click **Connect**, and copy the **Session pooler** connection string. Put your database password in it (Project Settings → Database → Reset database password if you don't have it).
2. **Render:** New → **Blueprint** → choose this GitHub repository. It reads `render.yaml`. Paste the connection string as `DATABASE_URL`.

The tables are created on first start, in their own `prov` schema that Supabase's public API can't reach.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase Session pooler string |
| `NODE_ENV` | `production` (secure cookies + HSTS; site must be on HTTPS) |
| `TRUST_PROXY` | `1` behind the host's proxy (Render) |
| `SESSION_SECRET` | 32+ random characters (Render generates it) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | only for a brand-new database: creates the first admin on first start. Remove them afterwards. |

Render's free plan sleeps after 15 minutes without visitors, and the next visit waits about a minute. A free monitor (e.g. UptimeRobot) that opens `/api/config` every 10 minutes keeps it awake. That also keeps Supabase from pausing the project after a week without use.

## Tests

```
npm test
```
