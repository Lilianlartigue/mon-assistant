create table if not exists public.calendar_sync_items (
  id text primary key,
  source text not null default 'icloud',
  kind text not null check (kind in ('ical','birthday')),
  calendar_name text,
  title text,
  ical text,
  birthday_month integer,
  birthday_day integer,
  birthday_year integer,
  sync_token text not null,
  updated_at timestamptz not null default now()
);

create index if not exists calendar_sync_items_source_idx on public.calendar_sync_items(source);
create index if not exists calendar_sync_items_sync_token_idx on public.calendar_sync_items(sync_token);

create table if not exists public.calendar_sync_state (
  id text primary key,
  synced_at timestamptz,
  item_count integer not null default 0,
  calendar_count integer not null default 0,
  birthday_count integer not null default 0,
  status text not null default 'never',
  details jsonb not null default '{}'::jsonb
);

alter table public.calendar_sync_items enable row level security;
alter table public.calendar_sync_state enable row level security;

-- No public policies are created. Server functions use the Supabase service-role key.
