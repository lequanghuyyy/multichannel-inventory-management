# OctoFlow Seller — Android

Ứng dụng Android là bản React Seller được đóng gói trong Capacitor WebView; nghiệp vụ và giao diện được chia sẻ với web app. Package ID hiện tại là `com.datt.seller`.

## Yêu cầu

- Node.js `>=24 <25`
- JDK 21
- Android SDK với Android Platform 36 và Platform Tools

## Build bản debug

Từ thư mục gốc repository, chạy trong PowerShell:

```powershell
cd apps/seller
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Trên macOS/Linux, dùng `./gradlew assembleDebug` thay cho `gradlew.bat`.

APK được tạo tại:

```text
apps/seller/android/app/build/outputs/apk/debug/app-debug.apk
```

Để cài lên thiết bị đã kết nối qua ADB:

```powershell
.\gradlew.bat installDebug
```

## API endpoint trên thiết bị

Bản mobile cần API có HTTPS origin mà thiết bị truy cập được. Trước `npm run build`, đặt `VITE_API_URL` trong môi trường build hoặc file `apps/seller/.env`. Không dùng `localhost`/loopback cho thiết bị thật và không đặt password, token hay API key trong biến `VITE_*`. Xem [`.env.example`](../.env.example).

## Release

Repository chưa cấu hình release signing. Không phát hành APK/AAB release cho người dùng trước khi thiết lập signing an toàn; không commit keystore, `key.properties` hoặc mật khẩu signing.

Xem [BUILD_GUIDE.md](BUILD_GUIDE.md) để cài Android SDK và xử lý lỗi build.
