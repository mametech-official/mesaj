-- =====================================================================
--  MESAJ UYGULAMASI - v4 Geliştirme Yükseltme Paketi (sql/update_v4.sql)
--
--  İçerik:
--    1. Mesaj Yanıtlama (reply_to_id, alıntı mesaj önizleme)
--    2. Mesaj Silme & Düzenleme (is_deleted, edited_at, RPC'ler)
--    3. Emoji Reaksiyonları (message_reactions tablosu, toggle RPC)
--    4. Yıldızlı Mesajlar (starred_messages tablosu, toggle RPC)
--    5. Dosya / Belge & Video Desteği (file_path, file_name, file_size, media_type)
--    6. Kullanıcı Engelleme (blocked_users tablosu, block/unblock RPC'leri)
--    7. Profil Biyografisi (about / durum bilgisi)
--    8. Gelişmiş get_chats() ve get_starred_messages() fonksiyonları
--    9. Realtime ve Storage güncellemeleri
--
--  Kullanım: Supabase SQL Editörüne yapıştırıp "Run" butonuna basın.
--  Veri kaybı yaşanmaz (idempotent - tekrar çalıştırılabilir).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES GÜNCELLEMESİ (Biyografi / Durum)
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists about text default 'Merhaba! Ben de Mesaj kullanıyorum.';

alter table public.profiles drop constraint if exists profiles_about_len;
alter table public.profiles add constraint profiles_about_len
  check (about is null or char_length(about) <= 140);

grant update (about) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2) BLOCKED USERS (Kullanıcı Engelleme)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3) MESSAGES TABLOSU GENİŞLETMESİ
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists reply_to_id   uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists is_deleted    boolean not null default false;
alter table public.messages add column if not exists edited_at     timestamptz;
alter table public.messages add column if not exists file_path     text;
alter table public.messages add column if not exists file_name     text;
alter table public.messages add column if not exists file_size     integer;
alter table public.messages add column if not exists media_type    text not null default 'text';

-- Kısıtlamaları güncelle
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

-- Mesaj gönderme RLS politikasını genişlet (engelli kullanıcı kontrolü ile)
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.friends f
       where f.user_id = (select auth.uid()) and f.friend_id = receiver_id
    )
    -- Karşı taraf beni engellememiş olmalı ve ben de onu engellememiş olmalıyım
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

-- ---------------------------------------------------------------------
-- 4) MESSAGE REACTIONS (Emoji Tepkileri)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5) STARRED MESSAGES (Yıldızlı Mesajlar)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6) RPC FONKSİYONLARI (Silme, Düzenleme, Tepki, Engelleme, Yıldız)
-- ---------------------------------------------------------------------

-- 6.1 Herkesten Sil (Yalnızca mesajı gönderen yapabilir)
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

-- 6.2 Mesaj İçeriğini Düzenle (Yalnızca gönderen)
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

-- 6.3 Emoji Reaksiyonunu Aç / Kapat (Toggle)
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

-- 6.4 Mesajı Yıldızla / Yıldızı Kaldır (Toggle Star)
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

-- 6.5 Kullanıcıyı Engelle
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

-- 6.6 Kullanıcı Engelini Kaldır
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

-- 6.7 Engellenen Kullanıcılar Listesi
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

-- 6.8 Yıldızlı Mesajlar Listesi
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

-- 6.9 Gelişmiş get_chats() (about, is_blocked, file & reply destekli)
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

-- ---------------------------------------------------------------------
-- 7) YETKİLER (GRANT)
-- ---------------------------------------------------------------------
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
grant execute on function public.edit_message_content(uuid, text) to authenticated;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;
grant execute on function public.toggle_star_message(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_blocked_users() to authenticated;
grant execute on function public.get_starred_messages(uuid) to authenticated;
grant execute on function public.get_chats() to authenticated;

-- ---------------------------------------------------------------------
-- 8) REALTIME YAYINI GENİŞLETME
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 9) STORAGE BUCKET MİME TÜRLERİ VE OKUMA POLİTİKASI (Belge, Video ve 50 MB sınır)
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 52428800, -- 50 MB
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
