# Türk Eğitim-Sen Bilecik (Expo)

## Web’de çalıştırma

```powershell
npm install
npm run web
```

## Şifre sıfırlama (E-posta OTP) için backend

Bu repo içinde demo bir backend var: `server/`.

### 1) SMTP ayarları

`server/.env.example` dosyasını kopyalayıp `server/.env` oluşturun ve SMTP bilgilerinizi girin.

### 2) Backend’i çalıştırma

```powershell
npm --prefix server install
npm run server
```

Backend varsayılan olarak `http://localhost:8787` adresinde çalışır.

## Üye verisi (Firebase / Firestore)

1500+ üye için `server/members.json` yerine **Firebase Firestore** önerilir.

### Firebase kurulumu

- Firebase Console’da proje oluşturun
- Firestore Database’i açın (Native mode)
- Project settings → Service accounts → **Generate new private key**
- JSON içindeki alanları `server/.env` içine girin:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` (içindeki `\n` kaçışları bozulmadan)

### Firestore veri modeli

Collection: `members`

Document alanları:
- `id` (string)
- `fullName` (string, `ad.soyad`)
- `email` (string)
- `emailLower` (string, `email`in küçük harfi)
- `role` (`admin` veya `uye`)
- `passwordHash` (string, boş olabilir)

### Mevcut üyelere yeni alan ekleme (Firestore)

İki (veya daha fazla) alanı tüm üyelere topluca eklemek için:

```powershell
# örnek: iki alan ekle, sadece eksik olanlara boş string yaz
npm run members:add-fields -- field1 field2 --value ""
```

Varsa mevcut değerlerin üstüne yazmak için `--overwrite` ekleyin.

Alanları topluca kaldırmak için:

```powershell
npm run members:remove-fields -- field1 field2
```

### 3) Uygulamanın backend adresi

Expo için şu env değişkeni kullanılır:

- `EXPO_PUBLIC_API_BASE_URL` (örn: `http://localhost:8787`)

Web’de çalışırken `localhost` uygundur. Telefon/emülatörde test edecekseniz `localhost` yerine bilgisayarınızın LAN IP’sini verin (örn. `http://192.168.1.10:8787`).

