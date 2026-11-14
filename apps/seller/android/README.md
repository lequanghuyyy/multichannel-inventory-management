# DATT Seller - Android App

## Build nhanh (Quick Start)

### Yêu cầu
- ✅ Java JDK (đã có - version 21)
- ⚠️ Android SDK Command-line Tools (cần cài đặt)
- ✅ Node.js >= 24 (đã có)

### Setup lần đầu

```powershell
# Từ thư mục gốc dự án
.\scripts\setup-android-sdk.ps1
```

Script này sẽ:
- Hướng dẫn tải và cài Android SDK
- Cài đặt các components cần thiết
- Kiểm tra cấu hình

### Build APK

```powershell
# Build Debug APK (dùng để test)
.\scripts\build-android.ps1

# Build và cài luôn lên điện thoại
.\scripts\build-android.ps1 -Install

# Build Release APK (production)
.\scripts\build-android.ps1 -Release

# Clean build (nếu gặp lỗi)
.\scripts\build-android.ps1 -Clean
```

### Test trên điện thoại thật

1. **Bật USB Debugging:**
   - Settings → About phone → Tap "Build number" 7 lần
   - Settings → Developer options → Enable "USB debugging"

2. **Kết nối và kiểm tra:**
   ```powershell
   adb devices
   ```

3. **Cài đặt APK:**
   ```powershell
   .\scripts\build-android.ps1 -Install
   ```

4. **Xem logs realtime:**
   ```powershell
   adb logcat | Select-String "DATT"
   ```

## Hướng dẫn chi tiết

Xem: [BUILD_GUIDE.md](./BUILD_GUIDE.md)

## Thông tin app

- **Package Name**: `com.datt.seller`
- **App Name**: DATT Seller
- **Min SDK**: 24 (Android 7.0+)
- **Target SDK**: 36 (Android 15)

## Build outputs

- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `app/build/outputs/apk/release/app-release.apk`
- AAB Bundle: `app/build/outputs/bundle/release/app-release.aab`

## Troubleshooting

### "ANDROID_HOME not set"
```powershell
$env:ANDROID_HOME = "C:\Android"
$env:ANDROID_SDK_ROOT = "C:\Android"
```

### "sdkmanager not found"
- Thêm vào PATH: `%ANDROID_HOME%\cmdline-tools\latest\bin`
- Restart terminal

### "device unauthorized"
- Chấp nhận USB debugging prompt trên điện thoại
- Chạy lại `adb devices`

### Build failed
```powershell
# Clean và build lại
.\scripts\build-android.ps1 -Clean
```
