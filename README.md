# Zenvixa

Responsive digital marketing course and affiliate platform built with HTML, CSS, vanilla JavaScript, Supabase and Razorpay hooks.

## Files

- `index.html` — public landing page and course catalog with dedicated auth links.
- `login.html` — clean two-field member/admin login page.
- `register.html` — distinct registration page with profile, country, mandatory User ID/referral and password confirmation fields.
- `dashboard.html` — protected member dashboard for courses, referral team, KYC, wallet, profile and activation.
- `admin.html` — protected super-admin workspace for users, KYC, finance requests, course PDFs and transactions.
- `styles.css` — responsive visual system for both experiences.
- `dashboard.css` / `admin-plus.css` / `index-compact.css` — focused responsive UI layers.
- `js/config.js` — Supabase URL and browser-safe publishable key.
- `js/app.js` / `js/dashboard.js` / `js/admin.js` — auth, routing, member and admin logic.
- `js/auth-pages.js` — dedicated login/register validation, password visibility toggles and registration success summary.

## Run locally

Serve the folder with any static server, for example:

```bash
python3 -m http.server 5500
```

Then open `http://localhost:5500`.

## Promote the first admin

1. Register a user from the homepage.
2. In Supabase SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where id = 'YOUR_AUTH_USER_ID';
```

The schema, trigger, RLS policies, private `course-pdfs` / `kyc-documents` buckets, and Razorpay Edge Functions are already applied to the connected Zenvixa Supabase project.

## Razorpay setup

The secure Edge Functions are deployed as `create-razorpay-order` and `verify-razorpay-payment`. Add these project secrets before accepting live payments:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

The browser only receives the public checkout key and never receives the Razorpay secret.

## Referral and admin access

Registration requires a valid existing User ID/referral code. Every new member receives a unique `ZV-XXXXXXXX` code, which is stored as the official referral code and can be shared with the next member.

The admin User Management panel can search by UUID, User ID/referral code, name, email or phone, then view joining date, team and wallet details. Admins can edit profile fields and securely set a new password. Existing passwords are never readable in plaintext, including by admins.
