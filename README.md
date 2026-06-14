# ConveyClear Client Portal

A secure client portal for ConveyClear, a South African property conveyancing company. Clients can submit FICA documents, track service requests, and communicate with staff.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Auth & Database**: Supabase
- **File Storage**: Supabase Storage

## Features

- **Client Portal**: Secure signup/login, document upload, service request submission, status tracking
- **Admin Panel**: View all submissions, update request statuses, manage client documents
- **POPIA Compliance**: Data handling notices on signup
- **Mobile Responsive**: Built with Tailwind CSS

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-org/convey-clear-app.git
cd convey-clear-app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in your Supabase credentials from the [Supabase Dashboard](https://supabase.com/dashboard).

### 4. Database

> ⚠️ **The `supabase/migrations/001_initial.sql` and `002_storage_policies.sql` files in this app are STALE scaffold** for an old schema (`profiles`/`service_requests`) and are slated for deletion. **Do not run them.**
>
> The live schema is maintained in `../cc-notes and stuff/sql/` (`001`–`006`): base schema, seed, deal-sync, 4-phase schema sprint, auth wiring + business partners, and RLS. The DB is already provisioned on Supabase (project `yhgriqagrhyblhmloctc`, eu-west-1) with RLS enabled on all tables. Central table is `matters`; auth maps `auth.users` → `public.users` via `users.auth_user_id`. See `../SECURITY.md` for the security/RLS posture.

### 5. Configure Supabase Storage

No storage bucket exists yet — uploaded documents currently flow to Google Drive via n8n. When a Supabase `documents` bucket is added it MUST be private + RLS + signed URLs (see `../SECURITY.md`).

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/                   # Next.js App Router pages
│   ├── auth/              # Auth pages (login, signup, reset)
│   ├── dashboard/         # Client portal pages
│   ├── admin/             # Admin panel pages
│   └── api/               # API route handlers
├── components/            # Reusable React components
│   ├── ui/                # Generic UI primitives
│   ├── auth/              # Auth form components
│   ├── dashboard/         # Client dashboard components
│   └── admin/             # Admin panel components
├── lib/
│   ├── supabase/          # Supabase client helpers
│   └── utils.ts           # Shared utilities
├── hooks/                 # Custom React hooks
└── types/                 # TypeScript type definitions
supabase/
└── migrations/            # SQL migration files
```

## Roles & Access

Auth maps `auth.users` → `public.users` (`users.auth_user_id`). A signup trigger creates a `client` profile by default; staff/partner roles are seeded or promoted by an admin (signup metadata is never trusted for role). Roles: `admin`, `staff_services`, `staff_ops`, `staff_delivery`, `client`, `business_partner`, `attorney`, `council`, `contractor`. Staff roles route to `/admin`; everyone else to `/dashboard`. Access is enforced by Postgres RLS, not app logic.

> Note: the old `ADMIN_INVITE_TOKEN` signup flow belongs to the legacy scaffold and is being replaced during the dashboard rebuild.

## POPIA Compliance

The application includes:
- Explicit consent notices on the signup form
- Privacy policy acknowledgement before document upload
- Data subject rights information
- Secure file storage with RLS policies

## Deployment

Deploy to [Vercel](https://vercel.com) for the easiest Next.js experience. Ensure all environment variables are configured in your Vercel project settings.
