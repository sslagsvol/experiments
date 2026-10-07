# Global leaderboard setup (Supabase)

Until this is set up, the game keeps a per-device top 10. About 5 minutes, once.

## 1. Create the project
1. Go to [supabase.com](https://supabase.com) and sign in (GitHub sign-in works).
2. **New project.** Any name (e.g. `vector-wars`), any region near you, and a database password (you won't need it for this). Wait a minute or two while it starts.

## 2. Create the scores table
In the project, open **SQL Editor → New query**, paste this, and click **Run**:

```sql
-- One row per saved high score.
create table public.vector_wars_scores (
  id bigint generated always as identity primary key,
  initials text not null check (char_length(initials) between 1 and 3),
  score integer not null check (score between 1 and 10000000),
  created_at timestamptz not null default now()
);

create index vector_wars_scores_top on public.vector_wars_scores (score desc, created_at);

-- Anyone may read the board and add a score. Nobody may edit or delete one.
alter table public.vector_wars_scores enable row level security;

create policy "read scores" on public.vector_wars_scores
  for select to anon using (true);

create policy "add a score" on public.vector_wars_scores
  for insert to anon with check (true);

grant select, insert on public.vector_wars_scores to anon;
```

## 3. Copy two values
Open **Project Settings → API** (or the **Connect** button):
- **Project URL**, like `https://abcdefghijkl.supabase.co`. On newer dashboards it's under **Project Settings → Data API**. Or build it from the project ID in your browser's address bar: `supabase.com/dashboard/project/abcdefghijkl` → `https://abcdefghijkl.supabase.co`
- The **anon / public** key, or the **publishable** key (starts with `sb_publishable_`) on newer projects

These are safe to put in the game. They're meant to be public, and the rules above only allow reading and adding scores. **Don't** use the `service_role` / secret key.

## 4. Plug them in
Paste both values to Claude, or put them in `src/config.js` yourself:

```js
LEADERBOARD: { url: 'https://abcdefghijkl.supabase.co', key: 'your-anon-or-publishable-key' },
```

Commit and push. Everyone playing the live game now shares one board.

## How it behaves
- The board loads when the game opens and again at each game over. A copy is cached on each device, so it still shows offline.
- A score saved while offline is queued and sent on the next successful load.
- If fewer than 10 real scores exist, the arcade CPU entries (VEC, TOR, WAR…) fill the gaps. They're never stored in the database.
- **No security, as requested:** anyone who looks at the code could post a fake score. To wipe or moderate, delete rows in Supabase's **Table Editor**.
