create table if not exists public.myau_players (user_id uuid primary key references auth.users(id) on delete cascade, nickname text not null check (char_length(nickname) between 2 and 20 and nickname !~ '[<>]'), best_score integer not null default 0 check (best_score between 0 and 100000000), updated_at timestamptz not null default now());
create index if not exists myau_players_ranking on public.myau_players(best_score desc,updated_at asc,user_id);
alter table public.myau_players enable row level security;
revoke all on public.myau_players from anon;
grant select,insert,update on public.myau_players to authenticated;
drop policy if exists "world ranking readable" on public.myau_players;
create policy "world ranking readable" on public.myau_players for select to authenticated using (true);
drop policy if exists "owner creates own record" on public.myau_players;
create policy "owner creates own record" on public.myau_players for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "owner updates own record" on public.myau_players;
create policy "owner updates own record" on public.myau_players for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.myau_guard_score() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' and NEW.best_score < OLD.best_score then NEW.best_score := OLD.best_score; end if;
 NEW.updated_at := now();
 return NEW;
end $$;
drop trigger if exists myau_guard_score_trigger on public.myau_players;
create trigger myau_guard_score_trigger before insert or update on public.myau_players for each row execute function public.myau_guard_score();