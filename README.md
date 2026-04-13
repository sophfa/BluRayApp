# Blu-ray Collection

Angular app for tracking Blu-rays and games, deployed to GitHub Pages with Auth0 login and Supabase-backed per-user storage.

## Storage model

- Auth0 authenticates the user.
- Supabase stores one row per user per collection.
- Row Level Security restricts every row to the matching Auth0 user id.
- The app also keeps a per-user browser cache for startup speed and offline fallback.

## Supabase + Auth0 setup

This app now expects Supabase `Third-Party Auth` with Auth0, not a public shared row.

### 1. Enable Auth0 in Supabase

In Supabase:

1. Open `Authentication -> Third-Party Auth`.
2. Add an `Auth0` integration.
3. Use your Auth0 tenant `dev-e0rni53ebj3apjt5`.
4. Save the integration.

### 2. Add the required Auth0 token claim

Supabase RLS expects an authenticated JWT role. Add a Post-Login Action in Auth0 and attach it to the Login flow:

```js
exports.onExecutePostLogin = async (event, api) => {
  api.idToken.setCustomClaim('role', 'authenticated');
  api.accessToken.setCustomClaim('role', 'authenticated');
};
```

This app currently sends the Auth0 ID token to Supabase, so the `idToken` claim is required here.

### 3. Create the per-user state table

In the Supabase SQL editor, run:

```sql
create table if not exists public.user_app_state (
  owner_user_id text not null,
  collection_key text not null,
  movies jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (owner_user_id, collection_key)
);

alter table public.user_app_state enable row level security;

create policy "users read own app state"
on public.user_app_state
for select
to authenticated
using ((auth.jwt() ->> 'sub') = owner_user_id);

create policy "users insert own app state"
on public.user_app_state
for insert
to authenticated
with check ((auth.jwt() ->> 'sub') = owner_user_id);

create policy "users update own app state"
on public.user_app_state
for update
to authenticated
using ((auth.jwt() ->> 'sub') = owner_user_id)
with check ((auth.jwt() ->> 'sub') = owner_user_id);
```

### 4. Create the profile and friends tables

If you are using the profile setup and friends features, you also need these database tables:

```sql
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth0_id text not null unique,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

create policy "authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "users insert own profile"
on public.profiles
for insert
to authenticated
with check ((auth.jwt() ->> 'sub') = auth0_id);

create policy "users update own profile"
on public.profiles
for update
to authenticated
using ((auth.jwt() ->> 'sub') = auth0_id)
with check ((auth.jwt() ->> 'sub') = auth0_id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint friendships_unique_pair unique (requester_id, recipient_id),
  constraint friendships_no_self check (requester_id <> recipient_id)
);

alter table public.friendships enable row level security;

create policy "users read own friendships"
on public.friendships
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = requester_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = recipient_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
);

create policy "users create friendship requests"
on public.friendships
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = requester_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
);

create policy "users update own friendships"
on public.friendships
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = requester_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = recipient_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    where profile.id = requester_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = recipient_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
);

create policy "users delete own friendships"
on public.friendships
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = requester_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = recipient_id
      and profile.auth0_id = (auth.jwt() ->> 'sub')
  )
);
```

### 5. Create the avatars storage bucket

The profile setup screen uploads avatars to a bucket called `avatars`. Create it in Supabase and add storage policies:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "authenticated users can read avatars" on storage.objects;
drop policy if exists "users upload own avatar" on storage.objects;
drop policy if exists "users update own avatar" on storage.objects;
drop policy if exists "users delete own avatar" on storage.objects;

create policy "authenticated users can read avatars"
on storage.objects
for select
to authenticated
using (bucket_id = 'avatars');

create policy "users upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = translate(trim(trailing '=' from encode(convert_to(auth.jwt() ->> 'sub', 'utf8'), 'base64')), '+/', '-_')
);

create policy "users update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = translate(trim(trailing '=' from encode(convert_to(auth.jwt() ->> 'sub', 'utf8'), 'base64')), '+/', '-_')
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = translate(trim(trailing '=' from encode(convert_to(auth.jwt() ->> 'sub', 'utf8'), 'base64')), '+/', '-_')
);

create policy "users delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = translate(trim(trailing '=' from encode(convert_to(auth.jwt() ->> 'sub', 'utf8'), 'base64')), '+/', '-_')
);
```

If you already created the older avatar policies, rerun this whole block so the folder rule matches the app's encoded Auth0 id path.

If profile setup stays on `Saving...`, the most common causes are that `public.profiles` does not exist yet or the `avatars` bucket/policies have not been created.

### 6. Configure the frontend runtime file

Update [public/app-config.json](/mnt/c/Repositories/BluRayApp/public/app-config.json):

```json
{
  "supabaseUrl": "https://your-project-ref.supabase.co",
  "supabaseKey": "your-publishable-key",
  "stateTable": "user_app_state"
}
```

`public/app-config.json` is intentionally public. Supabase publishable keys are designed for browser apps.

### 7. Auth0 application URLs

In Auth0, make sure these are configured on the SPA app:

- Allowed Callback URLs: `http://localhost:4200/`, `https://sophfa.github.io/BluRayApp/`
- Allowed Logout URLs: `http://localhost:4200/`, `https://sophfa.github.io/BluRayApp/`
- Allowed Web Origins: `http://localhost:4200`, `https://sophfa.github.io`

## Local development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm start
```

## GitHub Pages deploy

The workflow in [.github/workflows/deploy.yml](/mnt/c/Repositories/BluRayApp/.github/workflows/deploy.yml) builds the Angular app and deploys it to GitHub Pages on pushes to `main`.

Before the first successful deploy, open your GitHub repository settings and set `Settings -> Pages -> Source` to `GitHub Actions`.

- For a standard project site, no extra config is needed.
- For a custom domain at the root, set the repository variable `PAGES_BASE_PATH` to `/`.
- For a custom subpath, set `PAGES_BASE_PATH` to that path, for example `/collection`.
- If you add [CNAME](/mnt/c/Repositories/BluRayApp/public/CNAME) under `public/`, the workflow treats the deploy as a root custom-domain build and uses `/` automatically.

## Notes

- Existing legacy local cache entries are copied into the new per-user browser cache the first time a signed-in user loads the app.
- The old public shared `app_state` table is no longer used by the app once `stateTable` points at `user_app_state`.
