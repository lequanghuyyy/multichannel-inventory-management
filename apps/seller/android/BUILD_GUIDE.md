# Android build guide

Hướng dẫn này dành cho Android wrapper của OctoFlow Seller (Capacitor). Các bước tạo APK chạy từ source trong repository; không cần các script PowerShell riêng ở thư mục gốc.

## 1. Cài công cụ

Cần có:

- JDK 21 (`java -version`)
- Node.js `>=24 <25` và npm (`node --version`)
- Android SDK; cài Android Platform 36 và Platform Tools bằng Android Studio SDK Manager hoặc `sdkmanager`

Ví dụ cài component cần thiết:

```powershell
sdkmanager "platform-tools" "platforms;android-36"
```

Android Gradle Plugin của dự án là 8.13.0 và Gradle Wrapper tải Gradle 8.14.3.

## 2. Cấu hình Android SDK

Đặt `ANDROID_HOME` và `ANDROID_SDK_ROOT` trỏ tới thư mục SDK. Ví dụ PowerShell:

```powershell
$env:ANDROID_HOME = "C:\Android"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

Có thể cấu hình đường dẫn SDK trong `apps/seller/android/local.properties` dựa trên [`local.properties.example`](local.properties.example). File `local.properties` là cấu hình máy cá nhân, không commit.

## 3. Build APK debug

Từ thư mục gốc repository:

```powershell
cd apps/seller
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Trên macOS/Linux, dùng `./gradlew assembleDebug`. APK đầu ra:

```text
apps/seller/android/app/build/outputs/apk/debug/app-debug.apk
```

Cài trực tiếp lên thiết bị Android có bật USB debugging:

```powershell
.\gradlew.bat installDebug
```

## 4. Cấu hình API cho thiết bị

Web local dùng proxy của Vite; bản native cần URL API riêng có HTTPS và truy cập được từ điện thoại. Đặt `VITE_API_URL` trước khi build, ví dụ:

```powershell
$env:VITE_API_URL = "https://api.example.com"
```

Giá trị `VITE_*` được đóng gói vào frontend và không phải nơi lưu secret. Không dùng địa chỉ loopback cho thiết bị thật.

## Lưu ý phát hành

Project hiện có cấu hình build debug nhưng chưa khai báo release signing. Trước khi phát hành cần bổ sung cấu hình signing phù hợp và lưu keystore/credentials ngoài Git. Không commit APK/AAB, keystore hoặc `key.properties`.

Nếu Gradle không tìm thấy SDK, kiểm tra `ANDROID_HOME`, `ANDROID_SDK_ROOT` hoặc `local.properties`; sau đó chạy lại `sdkmanager --licenses` để chấp nhận license Android SDK.
