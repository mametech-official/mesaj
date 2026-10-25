-- =====================================================================
--  RESET: uygulamaya ait tüm tabloları/fonksiyonları siler (VERİ KAYBI!)
--  Önce bunu, ardından schema.sql'i çalıştır. auth.users (hesaplar) SİLİNMEZ.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_message_created on public.messages;

drop function if exists public.get_chats() cascade;
drop function if exists public.get_requests() cascade;
drop function if exists public.search_users(text) cascade;
drop function if exists public.send_friend_request(uuid) cascade;
drop function if exists public.respond_friend_request(uuid, boolean) cascade;
drop function if exists public.cancel_friend_request(uuid) cascade;
drop function if exists public.mark_messages_delivered() cascade;
drop function if exists public.mark_messages_read(uuid) cascade;
drop function if exists public.username_available(text) cascade;
drop function if exists public.handle_new_message() cascade;
drop function if exists public.handle_new_user() cascade;

drop table if exists public.messages cascade;
drop table if exists public.friends cascade;
drop table if exists public.friend_requests cascade;
drop table if exists public.contacts cascade;
drop table if exists public.profiles cascade;

drop policy if exists "mesaj_fotolari_insert_own_folder" on storage.objects;
drop policy if exists "mesaj_fotolari_select_participants" on storage.objects;
drop policy if exists "mesaj_fotolari_delete_own" on storage.objects;
drop policy if exists "avatars_select_all" on storage.objects;
drop policy if exists "avatars_insert_own_folder" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
