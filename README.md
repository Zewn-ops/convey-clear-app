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

### 4. Set up the database

Run the migration in `supabase/migrations/001_initial.sql` via the Supabase SQL Editor or Supabase CLI:

```bash
# With Supabase CLI
supabase db push
```

### 5. Configure Supabase Storage

Create a bucket named `documents` in your Supabase project with the following settings:
- **Public bucket**: No (private)
- **File size limit**: 10MB
- **Allowed MIME types**: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`

Apply the storage policies from `supabase/migrations/002_storage_policies.sql`.

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

## Admin Access

To create an admin account, sign up using the admin invite token set in `ADMIN_INVITE_TOKEN`. Navigate to `/auth/signup?admin=<your-token>`. Change the default token before deploying to production.

## POPIA Compliance

The application includes:
- Explicit consent notices on the signup form
- Privacy policy acknowledgement before document upload
- Data subject rights information
- Secure file storage with RLS policies

## Deployment

Deploy to [Vercel](https://vercel.com) for the easiest Next.js experience. Ensure all environment variables are configured in your Vercel project settings.
