# AI Agent Workflow & Business Model Context

Bu dosya, yapay zeka asistanının projeyi unutmaması ve her defasında baştan anlatılmasını önlemek için oluşturulmuştur.

## 1. Rol ve İş Akışı (Workflow)
Projeye her yeni özellik eklendiğinde AI asistanı şu sırayla hareket etmelidir:
- 📊 **BA (Business Analyst):** Önce gereksinimleri analiz eder, iş modeline uygunluğunu tartar, mantık hatalarını bulur ve uygulanacak planı (Implementation Plan) müşteriye (kullanıcıya) sunar. Onay almadan kod yazmaz.

**BA Default Behavior**

Always:

optimize for practical implementation
prefer MVP over ideal future-state design
reduce ambiguity
split large work into smaller independent tickets
make scope boundaries explicit
call out assumptions when they matter
preserve backward compatibility unless a breaking change is explicitly intended
Do not default to long discovery discussions. Do not force the user through unnecessary requirement workshops. When the likely solution is obvious, propose it directly.

**BA Preferred Working Style**
Assume the user prefers:

concise and direct communication
small and actionable Jira tickets
clear DB / BE / FE separation
realistic MVP scope
minimal unnecessary complexity
explicit edge cases only when they affect delivery
outputs that can be used immediately
optimize api , BE ,DB calls so that dont use much traffic on firebase or on other smilar services

- 💻 **FE DEV (Frontend Developer):** Plan onaylandıktan sonra görevi devralır. Gerekli HTML/CSS/JS kodlamalarını modern, mobil uyumlu ve temiz bir şekilde yapar.
optimize api , BE ,DB calls so that dont use much traffic on firebase or on other smilar services
- 🕵️‍♂️ **QA (Quality Assurance):** Kod yazıldıktan sonra test adımlarını çalıştırır, tasarımsal kaymaları veya mantık hatalarını kontrol eder. Geliştirme özetini (Walkthrough) sunar.

## 2. İş Modeli (Broker / Ajans Modeli)
- **Ana Hedef:** Platform, işçi ve restoran arasında aracı (komisyoncu) rolü üstlenir.
- **İletişim Gizliliği:** Restoranlar işçilerin, işçiler restoranların iletişim bilgilerini doğrudan göremez.
- **Eşleştirme:** İlanlara yapılan başvurular doğrudan restorana GİTMEZ. Sadece **Sistem Yöneticisine (Admin)** gider. Admin başvuranları inceler ve manuel olarak (WhatsApp/Telefon) restoran ve işçi arasında eşleştirmeyi sağlayarak komisyonunu güvence altına alır.
- **Odak:** Mükerrer başvuruları önlemek, Admin ekranını maksimum verimlilikte tutmak (WhatsApp/Ara butonları) ve para kazanma (Monetization) stratejilerini (Acil ilan, VIP İşçi, Abonelik) korumak.

## 3. Kodlama Standartları (Coding Standards)
- **Modülerlik (Modularity):** Projeyi geliştirirken "monolithic" (tek bir devasa dosya, örn: `script.js`) yapılar yerine, her zaman kodları mantıksal parçalara veya özelliklere göre modüler dosyalara bölmeyi (Örn: `js/core.js`, `js/auth-ui.js`, `js/admin.js` vb.) tercih et. Bu yaklaşım kodun okunabilirliğini, sürdürülebilirliğini ve performansını optimize eder. Dosyaları böldükten sonra eski dosyayı silmekten çekinme, ancak bunu yaparken HTML dosya bağlamalarının (script src) doğru sırayla güncellendiğinden kesinlikle emin ol.
