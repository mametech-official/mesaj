-- =====================================================================
--  MESAJ UYGULAMASI - Supabase şeması (v3)
--
--  Tablolar : profiles, friend_requests, friends, messages
--  RPC      : username_available, search_users, get_requests, get_chats,
--             send_friend_request, respond_friend_request, cancel_friend_request,
--             mark_messages_delivered, mark_messages_read
--  Storage  : 'mesaj-fotolari' (özel: görsel + ses), 'avatars' (herkese açık)
--  Realtime : messages, friend_requests, friends
--
--  Kullanım : Supabase > SQL Editor > New query > tümünü yapıştır > Run
--  Script tekrar çalıştırılabilir (idempotent). Eski sürümden (v1/v2) yükseltir.
--  Sorun çıkarsa önce sql/reset.sql, ardından bu dosyayı çalıştır.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Eski sürümlerden kalan nesneleri temizle
-- ---------------------------------------------------------------------
drop trigger  if exists on_message_created on public.messages;
drop function if exists public.handle_new_message() cascade;
drop function if exists public.get_chats() cascade;
drop table    if exists public.contacts cascade;

-- ---------------------------------------------------------------------
-- 1) PROFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  created_at  timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_username_key unique (username)
);

alter table public.profiles add column if not exists last_seen   timestamptz not null default now();
alter table public.profiles add column if not exists avatar_path text;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path is null or (avatar_path like id::text || '/%' and char_length(avatar_path) <= 300));

create extension if not exists pg_trgm with schema extensions;
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);

alter table public.profiles enable row level security;

-- Giriş yapmış herkes profilleri görebilir (kullanıcı adı araması için)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated
  using (true);

-- Kullanıcı yalnızca KENDİ satırını günceller (kolon yetkisi: last_seen, avatar_path)
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_last_seen" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (last_seen, avatar_path) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(btrim(new.raw_user_meta_data ->> 'username')));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where username = lower(btrim(p_username))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) FRIEND_REQUESTS  (istemci doğrudan yazamaz; yalnızca RPC'ler)
-- ---------------------------------------------------------------------
create table if not exists public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  receiver_id   uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friend_requests_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint friend_requests_not_self     check (sender_id <> receiver_id),
  constraint friend_requests_pair_key     unique (sender_id, receiver_id)
);

-- Aynı iki kişi arasında aynı anda yalnızca tek bekleyen istek olabilir (yön fark etmez)
create unique index if not exists friend_requests_one_pending_idx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index if not exists friend_requests_receiver_idx on public.friend_requests (receiver_id, status);
create index if not exists friend_requests_sender_idx   on public.friend_requests (sender_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_participants" on public.friend_requests;
create policy "friend_requests_select_participants"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id));

revoke all on public.friend_requests from anon, authenticated;
grant select on public.friend_requests to authenticated;

-- ---------------------------------------------------------------------
-- 3) FRIENDS  (iki yönlü satır: (a,b) ve (b,a); yalnızca RPC ile oluşur)
-- ---------------------------------------------------------------------
create table if not exists public.friends (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  friend_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friends_not_self check (user_id <> friend_id)
);

alter table public.friends enable row level security;

drop policy if exists "friends_select_own" on public.friends;
create policy "friends_select_own"
  on public.friends for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.friends from anon, authenticated;
grant select on public.friends to authenticated;

-- ---------------------------------------------------------------------
-- 4) MESSAGES  (yalnızca ARKADAŞLAR arasında)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  receiver_id  uuid not null references public.profiles (id) on delete cascade,
  content      text,
  image_path   text,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint messages_not_self    check (sender_id <> receiver_id),
  constraint messages_content_len check (content is null or (char_length(content) between 1 and 4000 and btrim(content) <> '')),
  constraint messages_image_len   check (image_path is null or char_length(image_path) <= 300)
);

alter table public.messages add column if not exists audio_path        text;
alter table public.messages add column if not exists audio_duration_ms integer;
alter table public.messages add column if not exists delivered_at      timestamptz;

alter table public.messages drop constraint if exists messages_has_body;
alter table public.messages add constraint messages_has_body
  check (content is not null or image_path is not null or audio_path is not null);

alter table public.messages drop constraint if exists messages_single_media;
alter table public.messages add constraint messages_single_media
  check (num_nonnulls(image_path, audio_path) <= 1);

alter table public.messages drop constraint if exists messages_audio_len;
alter table public.messages add constraint messages_audio_len
  check (audio_path is null or char_length(audio_path) <= 300);

alter table public.messages drop constraint if exists messages_audio_duration;
alter table public.messages add constraint messages_audio_duration
  check (audio_duration_ms is null or (audio_path is not null and audio_duration_ms between 0 and 600000));

create index if not exists messages_pair_idx
  on public.messages (sender_id, receiver_id, created_at desc);
create index if not exists messages_pair_rev_idx
  on public.messages (receiver_id, sender_id, created_at desc);
create index if not exists messages_unread_idx
  on public.messages (receiver_id, sender_id) where read_at is null;
create index if not exists messages_undelivered_idx
  on public.messages (receiver_id) where delivered_at is null;

alter table public.messages enable row level security;

drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
  on public.messages for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id));

-- Mesaj yalnızca kendi adına ve yalnızca arkadaşa gönderilebilir
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.friends f
       where f.user_id = (select auth.uid()) and f.friend_id = receiver_id
    )
    and (image_path is null or image_path like (select auth.uid())::text || '/%')
    and (audio_path is null or audio_path like (select auth.uid())::text || '/%')
  );

-- Yalnızca alıcı, iletildi/okundu bilgisini güncelleyebilir
drop policy if exists "messages_update_receiver_read" on public.messages;
create policy "messages_update_receiver_read"
  on public.messages for update to authenticated
  using (receiver_id = (select auth.uid()))
  with check (receiver_id = (select auth.uid()));

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at, delivered_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC'ler
-- ---------------------------------------------------------------------

-- 5.1 Arkadaşlık isteği gönder. Dönüş: 'outgoing' (istek gitti) | 'friend' (zaten/otomatik arkadaş)
create or replace function public.send_friend_request(p_receiver uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  uuid := auth.uid();
  rev public.friend_requests;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_receiver is null or p_receiver = me then raise exception 'cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver) then
    raise exception 'user not found';
  end if;

  if exists (select 1 from public.friends where user_id = me and friend_id = p_receiver) then
    return 'friend';
  end if;

  -- Karşı taraf zaten bana istek göndermişse otomatik kabul et
  select * into rev from public.friend_requests
   where sender_id = p_receiver and receiver_id = me and status = 'pending';
  if found then
    perform public.respond_friend_request(rev.id, true);
    return 'friend';
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (me, p_receiver, 'pending')
  on conflict (sender_id, receiver_id) do update
    set status = 'pending', created_at = now(), responded_at = null
    where public.friend_requests.status <> 'pending';

  return 'outgoing';
end;
$$;

-- 5.2 İsteği kabul / reddet (yalnızca alıcı)
create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.friend_requests;
begin
  select * into r from public.friend_requests
   where id = p_request and receiver_id = auth.uid() and status = 'pending'
   for update;
  if not found then raise exception 'request not found'; end if;

  update public.friend_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_request;

  if p_accept then
    insert into public.friends (user_id, friend_id)
    values (r.sender_id, r.receiver_id), (r.receiver_id, r.sender_id)
    on conflict do nothing;
  end if;
end;
$$;

-- 5.3 Gönderilen isteği iptal et (yalnızca gönderen)
create or replace function public.cancel_friend_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where id = p_request and sender_id = auth.uid() and status = 'pending';
  if not found then raise exception 'request not found'; end if;
end;
$$;

-- 5.4 Kullanıcı ara (+ ilişki durumu)
create or replace function public.search_users(p_query text)
returns table (
  id          uuid,
  username    text,
  avatar_path text,
  relation    text,      -- none | friend | outgoing | incoming
  request_id  uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.avatar_path,
    case
      when exists (select 1 from public.friends f
                    where f.user_id = (select auth.uid()) and f.friend_id = p.id) then 'friend'
      when r.id is not null and r.sender_id = (select auth.uid()) then 'outgoing'
      when r.id is not null then 'incoming'
      else 'none'
    end,
    r.id
  from public.profiles p
  left join public.friend_requests r
    on r.status = 'pending'
   and ((r.sender_id = (select auth.uid()) and r.receiver_id = p.id)
     or (r.receiver_id = (select auth.uid()) and r.sender_id = p.id))
  where p.id <> (select auth.uid())
    and char_length(btrim(p_query)) > 0
    and p.username ilike '%' ||
        replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by (p.username = lower(btrim(p_query))) desc, p.username
  limit 20;
$$;

-- 5.5 Bekleyen istekler (gelen + giden)
create or replace function public.get_requests()
returns table (
  request_id  uuid,
  direction   text,      -- incoming | outgoing
  user_id     uuid,
  username    text,
  avatar_path text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    case when r.receiver_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    p.id,
    p.username,
    p.avatar_path,
    r.created_at
  from public.friend_requests r
  join public.profiles p
    on p.id = case when r.receiver_id = (select auth.uid()) then r.sender_id else r.receiver_id end
  where r.status = 'pending'
    and (select auth.uid()) in (r.sender_id, r.receiver_id)
  order by r.created_at desc;
$$;

-- 5.6 Sohbet listesi = arkadaşlar (+ son mesaj, okunmamış sayısı)
create or replace function public.get_chats()
returns table (
  contact_id         uuid,
  username           text,
  avatar_path        text,
  last_seen          timestamptz,
  last_content       text,
  last_has_image     boolean,
  last_has_audio     boolean,
  last_audio_ms      integer,
  last_sender_id     uuid,
  last_delivered_at  timestamptz,
  last_read_at       timestamptz,
  last_message_at    timestamptz,
  unread_count       bigint,
  added_at           timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    f.friend_id,
    p.username,
    p.avatar_path,
    p.last_seen,
    lm.content,
    (lm.image_path is not null),
    (lm.audio_path is not null),
    lm.audio_duration_ms,
    lm.sender_id,
    lm.delivered_at,
    lm.read_at,
    lm.created_at,
    (select count(*)
       from public.messages u
      where u.sender_id = f.friend_id
        and u.receiver_id = (select auth.uid())
        and u.read_at is null),
    f.created_at
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  left join lateral (
    select m.content, m.image_path, m.audio_path, m.audio_duration_ms,
           m.sender_id, m.delivered_at, m.read_at, m.created_at
      from public.messages m
     where (m.sender_id = (select auth.uid()) and m.receiver_id = f.friend_id)
        or (m.sender_id = f.friend_id        and m.receiver_id = (select auth.uid()))
     order by m.created_at desc
     limit 1
  ) lm on true
  where f.user_id = (select auth.uid())
  order by coalesce(lm.created_at, f.created_at) desc;
$$;

-- 5.7 İletildi / okundu işaretleri (alıcı çağırır; RLS + kolon yetkisi geçerli)
create or replace function public.mark_messages_delivered()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.messages
     set delivered_at = now()
   where receiver_id = (select auth.uid()) and delivered_at is null;
$$;

create or replace function public.mark_messages_read(p_sender uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.messages
     set read_at = now(), delivered_at = coalesce(delivered_at, now())
   where receiver_id = (select auth.uid()) and sender_id = p_sender and read_at is null;
$$;

-- RPC yetkileri: yalnızca giriş yapmış kullanıcılar
do $$
declare f text;
begin
  foreach f in array array[
    'send_friend_request(uuid)', 'respond_friend_request(uuid, boolean)', 'cancel_friend_request(uuid)',
    'search_users(text)', 'get_requests()', 'get_chats()',
    'mark_messages_delivered()', 'mark_messages_read(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) REALTIME
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'friend_requests', 'friends'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7) STORAGE
-- ---------------------------------------------------------------------
-- 7.1 'mesaj-fotolari': özel bucket, görsel + ses, 10 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mesaj-fotolari', 'mesaj-fotolari', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mesaj_fotolari_insert_own_folder" on storage.objects;
create policy "mesaj_fotolari_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mesaj-fotolari'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "mesaj_fotolari_select_participants" on storage.objects;
create policy "mesaj_fotolari_select_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mesaj-fotolari'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.messages m
         where (m.image_path = storage.objects.name or m.audio_path = storage.objects.name)
           and (select auth.uid()) in (m.sender_id, m.receiver_id)
      )
    )
  );

drop policy if exists "mesaj_fotolari_delete_own" on storage.objects;
create policy "mesaj_fotolari_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'mesaj-fotolari'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 7.2 'avatars': herkese açık okuma (URL ile), yazma yalnızca kendi klasörüne, 2 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_all" on storage.objects;
create policy "avatars_select_all"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------
-- 8) Profili olmayan mevcut hesaplar için otomatik profil (u_xxxxxxxxxx)
-- ---------------------------------------------------------------------
insert into public.profiles (id, username)
select u.id, 'u_' || substr(replace(u.id::text, '-', ''), 1, 10)
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;


-- =====================================================================
-- 9) v4 & v5 GENİŞLETME PAKETİ (Yanıt, Silme, Düzenleme, Reaksiyon, Yıldız, Dosya/Video, Engelleme, Biyografi)
-- =====================================================================

alter table public.profiles add column if not exists about text default 'Merhaba! Ben de Mesaj kullanıyorum.';
alter table public.profiles drop constraint if exists profiles_about_len;
alter table public.profiles add constraint profiles_about_len
  check (about is null or char_length(about) <= 140);
grant update (about) on public.profiles to authenticated;

create table if not exists public.blocked_users (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint  blocked_not_self check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_select_own" on public.blocked_users;
create policy "blocked_select_own"
  on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists "blocked_insert_own" on public.blocked_users;
create policy "blocked_insert_own"
  on public.blocked_users for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists "blocked_delete_own" on public.blocked_users;
create policy "blocked_delete_own"
  on public.blocked_users for delete to authenticated
  using (blocker_id = (select auth.uid()));

grant select, insert, delete on public.blocked_users to authenticated;

alter table public.messages add column if not exists reply_to_id   uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists is_deleted    boolean not null default false;
alter table public.messages add column if not exists edited_at     timestamptz;
alter table public.messages add column if not exists file_path     text;
alter table public.messages add column if not exists file_name     text;
alter table public.messages add column if not exists file_size     integer;
alter table public.messages add column if not exists media_type    text not null default 'text';

alter table public.messages drop constraint if exists messages_single_media;
alter table public.messages add constraint messages_single_media
  check (num_nonnulls(image_path, audio_path, file_path) <= 1);

alter table public.messages drop constraint if exists messages_has_body;
alter table public.messages add constraint messages_has_body
  check (
    content is not null or
    image_path is not null or
    audio_path is not null or
    file_path is not null or
    is_deleted = true
  );

alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages add constraint messages_media_type_check
  check (media_type in ('text', 'image', 'audio', 'video', 'document'));

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.friends f
       where f.user_id = (select auth.uid()) and f.friend_id = receiver_id
    )
    and not exists (
      select 1 from public.blocked_users b
       where (b.blocker_id = receiver_id and b.blocked_id = (select auth.uid()))
          or (b.blocker_id = (select auth.uid()) and b.blocked_id = receiver_id)
    )
    and (image_path is null or image_path like (select auth.uid())::text || '/%')
    and (audio_path is null or audio_path like (select auth.uid())::text || '/%')
    and (file_path  is null or file_path  like (select auth.uid())::text || '/%')
  );

grant select, insert on public.messages to authenticated;
grant update (read_at, delivered_at, is_deleted, edited_at, content) on public.messages to authenticated;

create table if not exists public.message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  constraint  uq_message_reaction unique (message_id, user_id, emoji)
);

create index if not exists msg_reactions_msg_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions_select_participants" on public.message_reactions;
create policy "reactions_select_participants"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and (select auth.uid()) in (m.sender_id, m.receiver_id)
    )
  );

drop policy if exists "reactions_insert_own" on public.message_reactions;
create policy "reactions_insert_own"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
       where m.id = message_id
         and (select auth.uid()) in (m.sender_id, m.receiver_id)
    )
  );

drop policy if exists "reactions_delete_own" on public.message_reactions;
create policy "reactions_delete_own"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.message_reactions to authenticated;

create table if not exists public.starred_messages (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.starred_messages enable row level security;

drop policy if exists "starred_own_all" on public.starred_messages;
create policy "starred_own_all"
  on public.starred_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, delete on public.starred_messages to authenticated;

create or replace function public.delete_message_for_everyone(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages
   where id = p_message_id and sender_id = auth.uid();
  if not found then raise exception 'message not found or not sender'; end if;

  update public.messages
     set is_deleted = true,
         content = null,
         image_path = null,
         audio_path = null,
         file_path = null,
         file_name = null
   where id = p_message_id;
end;
$$;

create or replace function public.edit_message_content(p_message_id uuid, p_new_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  trimmed text := btrim(p_new_content);
begin
  if char_length(trimmed) = 0 or char_length(trimmed) > 4000 then
    raise exception 'invalid content length';
  end if;

  select * into m from public.messages
   where id = p_message_id and sender_id = auth.uid() and is_deleted = false;
  if not found then raise exception 'message not editable'; end if;

  update public.messages
     set content = trimmed,
         edited_at = now()
   where id = p_message_id;
end;
$$;

create or replace function public.toggle_message_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ex boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.messages m
     where m.id = p_message_id and me in (m.sender_id, m.receiver_id)
  ) then
    raise exception 'message not accessible';
  end if;

  select exists (
    select 1 from public.message_reactions
     where message_id = p_message_id and user_id = me and emoji = p_emoji
  ) into ex;

  if ex then
    -- Aynı emojiye tekrar tıklandıysa tepkiyi kaldır
    delete from public.message_reactions
     where message_id = p_message_id and user_id = me;
    return false;
  else
    -- Farklı bir emojiye tıklandıysa: Önce kullanıcının bu mesajdaki eski tepkilerini temizle (tek çeşit kuralı)
    delete from public.message_reactions
     where message_id = p_message_id and user_id = me;

    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, me, p_emoji)
    on conflict do nothing;
    return true;
  end if;
end;
$$;

create or replace function public.toggle_star_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ex boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;

  select exists (
    select 1 from public.starred_messages
     where user_id = me and message_id = p_message_id
  ) into ex;

  if ex then
    delete from public.starred_messages
     where user_id = me and message_id = p_message_id;
    return false;
  else
    insert into public.starred_messages (user_id, message_id)
    values (me, p_message_id)
    on conflict do nothing;
    return true;
  end if;
end;
$$;

create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_target is null or me = p_target then
    raise exception 'invalid parameters';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
  values (me, p_target)
  on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  delete from public.blocked_users
   where blocker_id = me and blocked_id = p_target;
end;
$$;

drop function if exists public.get_blocked_users();
create or replace function public.get_blocked_users()
returns table (
  user_id      uuid,
  username     text,
  avatar_path  text,
  blocked_at   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username, p.avatar_path, b.created_at
    from public.blocked_users b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = (select auth.uid())
   order by b.created_at desc;
$$;

drop function if exists public.get_starred_messages(uuid);
create or replace function public.get_starred_messages(p_chat_user_id uuid default null)
returns table (
  message_id    uuid,
  sender_id     uuid,
  receiver_id   uuid,
  sender_name   text,
  content       text,
  media_type    text,
  file_name     text,
  image_path    text,
  audio_path    text,
  file_path     text,
  created_at    timestamptz,
  starred_at    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.sender_id,
    m.receiver_id,
    sp.username,
    m.content,
    m.media_type,
    m.file_name,
    m.image_path,
    m.audio_path,
    m.file_path,
    m.created_at,
    s.created_at
  from public.starred_messages s
  join public.messages m on m.id = s.message_id
  join public.profiles sp on sp.id = m.sender_id
  where s.user_id = (select auth.uid())
    and (p_chat_user_id is null or (m.sender_id = p_chat_user_id or m.receiver_id = p_chat_user_id))
  order by s.created_at desc;
$$;

drop function if exists public.get_chats();
create or replace function public.get_chats()
returns table (
  contact_id         uuid,
  username           text,
  avatar_path        text,
  about              text,
  last_seen          timestamptz,
  is_blocked         boolean,
  blocked_by_them    boolean,
  last_content       text,
  last_has_image     boolean,
  last_has_audio     boolean,
  last_has_file      boolean,
  last_file_name     text,
  last_media_type    text,
  last_audio_ms      integer,
  last_sender_id     uuid,
  last_delivered_at  timestamptz,
  last_read_at       timestamptz,
  last_is_deleted    boolean,
  last_message_at    timestamptz,
  unread_count       bigint,
  added_at           timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    f.friend_id,
    p.username,
    p.avatar_path,
    p.about,
    p.last_seen,
    exists(select 1 from public.blocked_users b where b.blocker_id = (select auth.uid()) and b.blocked_id = f.friend_id),
    exists(select 1 from public.blocked_users b where b.blocker_id = f.friend_id and b.blocked_id = (select auth.uid())),
    lm.content,
    (lm.image_path is not null),
    (lm.audio_path is not null),
    (lm.file_path is not null),
    lm.file_name,
    lm.media_type,
    lm.audio_duration_ms,
    lm.sender_id,
    lm.delivered_at,
    lm.read_at,
    coalesce(lm.is_deleted, false),
    lm.created_at,
    (select count(*)
       from public.messages u
      where u.sender_id = f.friend_id
        and u.receiver_id = (select auth.uid())
        and u.read_at is null),
    f.created_at
  from public.friends f
  join public.profiles p on p.id = f.friend_id
  left join lateral (
    select m.content, m.image_path, m.audio_path, m.file_path, m.file_name, m.media_type,
           m.audio_duration_ms, m.sender_id, m.delivered_at, m.read_at, m.is_deleted, m.created_at
      from public.messages m
     where (m.sender_id = (select auth.uid()) and m.receiver_id = f.friend_id)
        or (m.sender_id = f.friend_id        and m.receiver_id = (select auth.uid()))
     order by m.created_at desc
     limit 1
  ) lm on true
  where f.user_id = (select auth.uid())
  order by coalesce(lm.created_at, f.created_at) desc;
$$;

grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
grant execute on function public.edit_message_content(uuid, text) to authenticated;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
grant execute on function public.toggle_star_message(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_blocked_users() to authenticated;
grant execute on function public.get_starred_messages(uuid) to authenticated;
grant execute on function public.get_chats() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['message_reactions', 'starred_messages', 'blocked_users'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac',
         'video/mp4', 'video/webm',
         'application/pdf', 'application/zip', 'application/x-zip-compressed',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/plain'
       ]
 where id = 'mesaj-fotolari';

drop policy if exists "mesaj_fotolari_select_participants" on storage.objects;
create policy "mesaj_fotolari_select_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'mesaj-fotolari'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.messages m
         where (
           m.image_path = storage.objects.name
           or m.audio_path = storage.objects.name
           or m.file_path  = storage.objects.name
         )
         and (select auth.uid()) in (m.sender_id, m.receiver_id)
      )
    )
  );
