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

### 2. Add the required Auth0 token claims and roles

Create Auth0 roles named `user` and `admin`, assign them to the right people, then add a Post-Login Action in Auth0 and attach it to the Login flow:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://mycollection.uk';
  const roles = event.authorization?.roles ?? [];

  api.idToken.setCustomClaim('role', 'authenticated');
  api.accessToken.setCustomClaim('role', 'authenticated');

  api.idToken.setCustomClaim(`${namespace}/roles`, roles);
  api.accessToken.setCustomClaim(`${namespace}/roles`, roles);
};
```

This app currently sends the Auth0 ID token to Supabase, so both the authenticated `role` claim and the namespaced roles claim on the ID token are required here.

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

### 5. Let accepted friends read each other's collections

If you want the read-only friend collection pages to work, add this extra `select` policy to `public.user_app_state`:

```sql
drop policy if exists "accepted friends can read app state" on public.user_app_state;

create policy "accepted friends can read app state"
on public.user_app_state
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles owner_profile
    join public.profiles viewer_profile
      on viewer_profile.auth0_id = (auth.jwt() ->> 'sub')
    join public.friendships friendship
      on friendship.status = 'accepted'
     and (
       (friendship.requester_id = owner_profile.id and friendship.recipient_id = viewer_profile.id)
       or
       (friendship.recipient_id = owner_profile.id and friendship.requester_id = viewer_profile.id)
     )
    where owner_profile.auth0_id = public.user_app_state.owner_user_id
  )
);
```

### 6. Create the suggestions and chat tables

The notifications page uses suggestions plus unread friend messages. Run this SQL too:

```sql
create table if not exists public.feature_suggestions (
  id uuid primary key default gen_random_uuid(),
  auth0_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(trim(title)) >= 3),
  body text not null check (char_length(trim(body)) >= 10),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  reviewed_by_auth0_id text
);

alter table public.feature_suggestions enable row level security;

drop policy if exists "users or admins read suggestions" on public.feature_suggestions;
drop policy if exists "users submit own suggestions" on public.feature_suggestions;
drop policy if exists "admins update suggestions" on public.feature_suggestions;

create policy "users or admins read suggestions"
on public.feature_suggestions
for select
to authenticated
using (
  auth0_id = (auth.jwt() ->> 'sub')
  or coalesce((auth.jwt() -> 'https://mycollection.uk/roles') ? 'admin', false)
);

create policy "users submit own suggestions"
on public.feature_suggestions
for insert
to authenticated
with check (
  auth0_id = (auth.jwt() ->> 'sub')
  and (
    profile_id is null
    or exists (
      select 1
      from public.profiles profile
      where profile.id = public.feature_suggestions.profile_id
        and profile.auth0_id = public.feature_suggestions.auth0_id
    )
  )
);

create policy "admins update suggestions"
on public.feature_suggestions
for update
to authenticated
using (coalesce((auth.jwt() -> 'https://mycollection.uk/roles') ? 'admin', false))
with check (coalesce((auth.jwt() -> 'https://mycollection.uk/roles') ? 'admin', false));

create table if not exists public.friend_messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists friend_messages_friendship_created_at_idx
  on public.friend_messages(friendship_id, created_at);

create index if not exists friend_messages_recipient_unread_idx
  on public.friend_messages(recipient_profile_id, read_at, created_at);

alter table public.friend_messages enable row level security;

drop policy if exists "friends read messages" on public.friend_messages;
drop policy if exists "friends send messages" on public.friend_messages;
drop policy if exists "recipients mark messages as read" on public.friend_messages;

create policy "friends read messages"
on public.friend_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    join public.friendships friendship
      on friendship.id = public.friend_messages.friendship_id
     and friendship.status = 'accepted'
    where me.auth0_id = (auth.jwt() ->> 'sub')
      and me.id in (public.friend_messages.sender_profile_id, public.friend_messages.recipient_profile_id)
      and me.id in (friendship.requester_id, friendship.recipient_id)
  )
);

create policy "friends send messages"
on public.friend_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles me
    join public.friendships friendship
      on friendship.id = public.friend_messages.friendship_id
     and friendship.status = 'accepted'
    where me.auth0_id = (auth.jwt() ->> 'sub')
      and me.id = public.friend_messages.sender_profile_id
      and me.id in (friendship.requester_id, friendship.recipient_id)
      and public.friend_messages.recipient_profile_id in (friendship.requester_id, friendship.recipient_id)
      and public.friend_messages.recipient_profile_id <> public.friend_messages.sender_profile_id
  )
);

create policy "recipients mark messages as read"
on public.friend_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.auth0_id = (auth.jwt() ->> 'sub')
      and me.id = public.friend_messages.recipient_profile_id
  )
)
with check (
  exists (
    select 1
    from public.profiles me
    where me.auth0_id = (auth.jwt() ->> 'sub')
      and me.id = public.friend_messages.recipient_profile_id
  )
);
```

### 7. Create the avatars storage bucket

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

### 8. Configure the frontend runtime file

Update [public/app-config.json](/mnt/c/Repositories/BluRayApp/public/app-config.json):

```json
{
  "supabaseUrl": "https://your-project-ref.supabase.co",
  "supabaseKey": "your-publishable-key",
  "stateTable": "user_app_state"
}
```

`public/app-config.json` is intentionally public. Supabase publishable keys are designed for browser apps.

### 9. Auth0 application URLs

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
