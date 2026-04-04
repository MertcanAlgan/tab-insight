# 🚀 Tab Insight - Chrome Extension

**Tab Insight**, Chrome sekmelerinizi daha verimli yönetmeniz için tasarlanmış, modern ve şık bir sekme yönetim asistanıdır. Sekmelerinizin ne zaman açıldığını, ne kadar süredir boşta kaldığını takip eder ve kalabalık sekmeleri tek tıkla temizlemenize olanak tanır.

---

## ✨ Özellikler

### 📊 Detaylı Sekme Bilgileri
- **Açılış Zamanı:** Her sekmenin ne zaman açıldığını (HH:mm formatında) görün.
- **Boşta Kalma Takibi:** Hangi sekmeye ne kadar süredir dokunulmadığını saniyelik hassasiyetle takip edin.
- **Görsel Ayrım:** Aktif, pasif ve uykudaki sekmeleri kolayca ayırt edin.

### 🧩 Organizasyon ve Gruplama
- **Sekme Grupları:** Chrome tab gruplarınızla tam uyumlu çalışır. Grupları daraltabilir veya genişletebilirsiniz.
- **Akıllı Gruplama:** Grup dışı sekmeler için özel bir "Grup Dışı" alanı bulunur.

### 🧹 Temizlik ve Yönetim
- **Cleanup Menüsü:** 
  - **Tümünü Kapat:** Çalışma alanınızı saniyeler içinde temizler.
  - **Pasifleri Kapat (15dk+):** 15 dakikadan uzun süredir kullanılmayan sekmeleri tek tıkla kapatır.
- **Güvenlik Önlemi (Safety Tab):** Kapatma işlemi sonucunda pencere kapanmasın diye eklenti otomatik olarak yeni ve boş bir sekme açar.
- **Hızlı Arama:** Başlık veya URL üzerinden anlık arama yaparak istediğiniz sekmeye ulaşın.
- **Gelişmiş Sıralama:** Sekmeleri "En Yeni", "En Eski" veya "En Uzun Süredir Boşta" kriterlerine göre dizebilirsiniz.

### 🌍 Çoklu Dil Desteği
- **Türkçe & İngilizce:** Eklenti içinden manuel olarak veya tarayıcı diline göre otomatik tercih yapabilirsiniz.

### 🎨 Modern Tasarım
- **Glassmorphism Arayüz:** Modern, yarı saydam ve göz yormayan karanlık tema.
- **Yumuşak Animasyonlar:** Akıcı geçişler ve etkileşimli hover efektleri.

---

## 🛠️ Kurulum (Installation)

Geliştirici modunda yüklemek için:

1. Bu projeyı bilgisayarınıza indirin veya klonlayın.
2. Google Chrome'u açın ve adres çubuğuna `chrome://extensions/` yazın.
3. Sağ üstteki **Geliştirici Modu (Developer Mode)** seçeneğini aktif hale getirin.
4. Sol üstteki **Paketlenmiş öğe yükle (Load unpacked)** butonuna tıklayın.
5. Proje klasörünü (`tabcounter-extension`) seçin.
6. Eklenti simgesine tıklayarak panelinizi açabilirsiniz!

---

## 📁 Dosya Yapısı

- `manifest.json`: Eklenti kimliği ve izinleri (V3).
- `popup.html`: Arayüz iskeleti ve şablonlar.
- `popup.js`: Tüm sıralama, temizlik ve zaman takip mantığı.
- `popup.css`: Modern tasarım ve animasyon kuralları.
- `background.js`: Sekme açılış zamanlarını kaydeden arka plan betiği.
- `_locales/`: Türkçe ve İngilizce dil dosyaları.

---

## 🔒 Güvenlik ve Gizlilik
Tab Insight, verilerinizi sadece tarayıcınızın yerel hafızasında (`chrome.storage.local`) tutar. Hiçbir veriniz sunuculara gönderilmez veya dışarı aktarılmaz.

---
**Geliştirici:** Mertcan Algan
**Sürüm:** 1.0.0
