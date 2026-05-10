-- ConveyClear initial schema migration
-- Run this in Supabase SQL Editor or via `supabase db push`

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  phone       text,
  id_number   text,                          -- SA ID number
  role        text not null default 'client' check (role in ('client', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read/update their own profile; admins can read all
create policy "profiles: self read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles: admin read all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────
-- SERVICE REQUESTS
-- ─────────────────────────────────────────
create type public.service_type as enum (
  'change_of_ownership',
  'rates_clearance',
  'compliance_certificate'
);

create type public.request_status as enum (
  'pending',
  'documents_required',
  'in_review',
  'in_progress',
  'completed',
  'rejected'
);

create table public.service_requests (
  id               uuid primary key default uuid_generate_v4(),
  client_id        uuid not null references public.profiles(id) on delete cascade,
  service_type     public.service_type not null,
  status           public.request_status not null default 'pending',
  property_address text not null,
  notes            text,
  admin_notes      text,
  assigned_to      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.service_requests enable row level security;

create trigger service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.handle_updated_at();

-- Clients can create and view their own requests
create policy "requests: client create"
  on public.service_requests for insert
  with check (auth.uid() = client_id);

create policy "requests: client read own"
  on public.service_requests for select
  using (auth.uid() = client_id);

-- Admins can read and update all requests
create policy "requests: admin read all"
  on public.service_requests for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "requests: admin update"
  on public.service_requests for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────
create type public.document_type as enum (
  'fica',
  'proof_of_residence',
  'id_document',
  'other'
);

create table public.documents (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  request_id    uuid references public.service_requests(id) on delete set null,
  document_type public.document_type not null,
  file_name     text not null,
  file_path     text not null,        -- Supabase Storage path
  file_size     bigint,               -- bytes
  mime_type     text,
  created_at    timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents: client insert own"
  on public.documents for insert
  with check (auth.uid() = client_id);

create policy "documents: client read own"
  on public.documents for select
  using (auth.uid() = client_id);

create policy "documents: admin read all"
  on public.documents for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─────────────────────────────────────────
-- AUDIT LOG (lightweight)
-- ─────────────────────────────────────────
create table public.audit_log (
  id          uuid primary key default uuid_generate_v4(),
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log: admin read"
  on public.audit_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "audit_log: insert own"
  on public.audit_log for insert
  with check (auth.uid() = actor_id);
