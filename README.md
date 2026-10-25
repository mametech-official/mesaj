# Mesaj — Supabase tabanlı WhatsApp Web benzeri mesajlaşma

Saf HTML/CSS/JS (ES modülleri), derleme adımı yok. Backend: Supabase (Auth, Postgres + RLS, Realtime, Storage).

## Klasör yapısı

```
index.html              Sayfa iskeleti
css/
  style.css             Giriş noktası (diğerlerini @import eder)
  base.css              Değişkenler, reset, keyframes
  components.css        Avatar, düğmeler, rozet, ses oynatıcı, lightbox
  auth.css              Giriş / kayıt
  sidebar.css           Uygulama iskeleti + sol panel
  chat.css              Balonlar, emoji paneli, yazma/kayıt alanı, fotoğraf önizleme
js/
  app.js                Giriş noktası, oturum yaşam döngüsü
  config.js             URL, anon key, sabitler
  supabase.js           Supabase istemcisi
  state.js              Ortak durum + olay yayını (bus)
  utils.js              DOM / biçimlendirme yardımcıları
  services/             Supabase'e dokunan katman (UI'dan bağımsız)
    auth.js  profiles.js  chats.js  messages.js  storage.js
    realtime.js         postgres_changes (mesajlar anlık düşer)
    presence.js         Çevrim içi durumu, "yazıyor…", son görülme
    recorder.js         MediaRecorder ile ses kaydı
  ui/                   DOM katmanı
    sidebar.js  chat-view.js  composer.js  message-bubble.js
    audio-player.js  emoji-picker.js  media-preview.js
    auth-view.js  lightbox.js  toast.js  screens.js  icons.js  sound.js
sql/schema.sql          Tablolar, RLS, trigger'lar, realtime, storage
```

## Kurulum

1. **Veritabanı:**
   - **Mevcut projeyi yükseltmek için:** Supabase → SQL Editor → [`sql/update_v4.sql`](file:///c:/Users/محمد/Documents/antigravity/mesaj/sql/update_v4.sql) dosyasının tamamını çalıştırın (hiçbir veriniz silinmez).
   - **Sıfırdan kurulum için:** [`sql/schema.sql`](file:///c:/Users/محمد/Documents/antigravity/mesaj/sql/schema.sql) dosyasını çalıştırın.
2. **Auth:** Authentication → Providers → Email. Test için *Confirm email* kapatılabilir.
3. **Realtime:** SQL `messages`, `friend_requests`, `friends`, `message_reactions`, `starred_messages`, `blocked_users` tablolarını yayına ekler.
4. **Çalıştır:**
   ```
   node server.js
   ```
   `http://localhost:5500` adresini tarayıcınızda açın.

## Özellikler (v4)

- **Mesaj Yanıtlama (Quote / Reply):** Mesaj menüsünden alıntılama, balonda alıntı kartı, tıklandığında mesaja yumuşak kayma ve parlama.
- **Mesaj Silme & Düzenleme:** *"Herkesten Sil"* (içeriği temizler ve 🚫 Bu mesaj silindi gösterir), *"Benden Sil"* ve *"Düzenle"* ((düzenlendi) etiketi).
- **Emoji Reaksiyonları:** Balon üstü hızlı tepki çubuğu (👍, ❤️, 😂, 😮, 😢, 🙏) ve anlık sayaç rozetleri.
- **Sohbet İçi Arama:** Başlıktaki büyüteç ile sohbetteki mesajlar içinde kelime arama, eşleşen sayısı ve Önceki/Sonraki butonları.
- **Yıldızlı Mesajlar:** Mesajları yıldızlama, sol paneldeki "Yıldızlılar" sekmesinden tüm yıldızlı mesajlara tek tıkla ulaşma.
- **Belge & Video Paylaşımı:** PDF, Word, ZIP, TXT belgeleri (dosya boyutu + indir butonu) ve MP4 videoları balonda oynatma.
- **Ses Kaydı Hızlandırma:** Ses kayıtlarında `1x` / `1.5x` / `2x` oynatma hızı butonu.
- **Masaüstü Web Bildirimleri:** Sekme arka plandayken gelen yeni mesajlar için işletim sistemi bildirimleri.
- **PWA (Progressive Web App):** `manifest.json` ve `sw.js` ile masaüstü / mobil cihaza uygulama olarak yüklenebilme.
- **Kullanıcı Engelleme & Biyografi:** İstenmeyen kullanıcıları engelleme / engel kaldırma ve profil biyografisi (hakkında metni) düzenleme.
- **Canlı Duvar Kağıdı Motoru:** 5 farklı WhatsApp teması (Zümrüt Aurora, Klasik Doodle, Gece Mavisi, OLED Saf Koyu, Sade Gradyan) ve %0-%50 opaklık sürgüsü.

## Güvenlik notları

- `anon` anahtarı tarayıcıda olması için tasarlanmıştır; koruma RLS ile sağlanır. **`service_role` anahtarını asla istemciye koyma.**
- Presence kanalı tüm giriş yapmış kullanıcılar arasında ortaktır (çevrim içi durumu herkese görünür). Çok büyük ölçekte kullanıcı başına kanal veya Realtime Authorization (private channel) tercih edilmelidir.
