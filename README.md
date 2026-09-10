# Hemşire Tedavi Yönetimi

Hemşireler için geliştirilen Electron/Vue masaüstü istemcisidir.

## Geliştirme

Node.js 20 kullanın.

```powershell
cd Client
npm ci
npm test
npm run electron:dev
```

Yerel makine dışındaki API adresleri HTTPS kullanmak zorundadır. API anahtarı Electron `safeStorage` ile işletim sistemi kasasında korunur ve arayüze geri okunmaz.

## Dağıtım ve güncelleme

```powershell
cd Client
npm run electron:build
```

Kurulum dosyası, `.blockmap` ve `latest.yml` dosyaları `Client/release` dizininde oluşturulur. Microsoft Store paketi Store tarafından imzalanır.

## Veri ve yedekleme

Masaüstü veritabanı atomik olarak yazılır; son 10 sürüm kullanıcı veri dizinindeki `backups` klasöründe tutulur. Gerçek hasta verileri, veritabanları, loglar ve paketler kaynak kontrolüne eklenmemelidir.
