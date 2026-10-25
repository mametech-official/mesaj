-- =====================================================================
--  update_v7.sql — v7 Güncellemesi:
--  1) İnteraktif Widget Desteği: XOX Mini Oyun, Canlı Anket, Ortak Yapılacaklar
--     mesaj alıcısının (receiver) da widget verilerini kaydedebilmesini sağlar.
-- =====================================================================

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
   where id = p_message_id and is_deleted = false;
  if not found then raise exception 'message not found'; end if;

  -- Gönderen her zaman kendi mesajını düzenleyebilir.
  -- Alıcı ise yalnızca interaktif widget içeriklerini ([GAME:, [POLL:, [TODO:) güncelleyebilir:
  if m.sender_id <> auth.uid() then
    if m.receiver_id <> auth.uid() or (
      m.content not like '[GAME:%' and
      m.content not like '[POLL:%' and
      m.content not like '[TODO:%'
    ) then
      raise exception 'message not editable';
    end if;
  end if;

  update public.messages
     set content = trimmed,
         edited_at = now()
   where id = p_message_id;
end;
$$;

grant execute on function public.edit_message_content(uuid, text) to authenticated;
