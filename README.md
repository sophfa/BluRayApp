# Blu-ray Collection

Angular app for tracking a single Blu-ray collection, deployed to GitHub Pages and backed by Supabase for durable storage.

## Storage model

- The app keeps a local browser cache for fast startup and offline fallback.
- The canonical copy is a single row in a Supabase table.
- There is no user-facing login flow.

Important:
Because this app is a public static frontend on GitHub Pages and you asked for no login, the Supabase table must be writable with the public anon key. That means anyone who can reach the site can also write to that table. This is acceptable only for low-risk personal data.

## Supabase setup

1. Create a Supabase project.
2. In the SQL editor, run:

```sql
create table if not exists public.app_state (
  id text primary key,
  movies jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_state enable row level security;

create policy "public read app_state"
on public.app_state
for select
to anon
using (id = 'default');

create policy "public insert app_state"
on public.app_state
for insert
to anon
with check (id = 'default');

create policy "public update app_state"
on public.app_state
for update
to anon
using (id = 'default')
with check (id = 'default');
```

3. Open `Project Settings` -> `API` in Supabase.
4. Copy the project URL and publishable key into [public/app-config.json](/mnt/c/Repositories/BluRayApp/public/app-config.json).

Example:

```json
{
  "supabaseUrl": "https://your-project-ref.supabase.co",
  "supabaseKey": "your-publishable-key",
  "stateTable": "app_state",
  "stateId": "default"
}
```

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

- For a standard project site, no extra config is needed.
- For a custom domain at the root, set the repository variable `PAGES_BASE_PATH` to `/`.
- For a custom subpath, set `PAGES_BASE_PATH` to that path, for example `/collection`.

## Notes

- The app seeds Supabase from your existing local cache or the bundled starter data on first run.
- `public/app-config.json` is intentionally public. Supabase publishable keys are designed for client-side use.
