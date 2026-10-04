create table sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table works (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  title text, author text, kind text not null, format text not null, language text not null default 'en',
  word_count int not null, chapter_count int not null, beat_count int not null,
  model_id text, question_set_version text not null,
  state text not null check (state in ('queued','running','paused','complete','failed','cancelled')),
  kind_warning text, kept boolean not null default false,
  structure jsonb not null,
  analysis jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz, last_viewed_at timestamptz not null default now(), expires_at timestamptz
);
create index works_session_idx on works(session_id);
create index works_expires_idx on works(expires_at) where expires_at is not null;

create table beats (
  work_id text not null references works(id) on delete cascade,
  idx int not null,
  chapter_idx int not null, start_cp int not null, end_cp int not null, start_s real, end_s real,
  word_count int not null, cache_key text not null,
  answers jsonb, model_id text, missing boolean not null default false,
  primary key (work_id, idx)
);

create table jobs (
  work_id text primary key references works(id) on delete cascade,
  total int not null, done int not null default 0, attempts int not null default 0,
  text_ciphertext bytea, key_ciphertext bytea, nonce bytea, key_nonce bytea,
  claimed_by text, heartbeat_at timestamptz, paused_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index jobs_heartbeat_idx on jobs(heartbeat_at);

create table share_links (
  token text primary key,
  work_id text not null references works(id) on delete cascade,
  created_at timestamptz not null default now(), revoked_at timestamptz
);
create index share_links_work_idx on share_links(work_id);

create table rate_limits (
  bucket text primary key,
  count int not null default 0,
  created_at timestamptz not null default now()
);
