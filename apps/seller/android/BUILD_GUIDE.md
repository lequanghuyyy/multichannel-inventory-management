# Hướng dẫn Build APK bằng Command-line Tools

## Yêu cầu hệ thống

1. **Java JDK**: Đã cài đặt (Java 11 hoặc Java 17 được khuyến nghị)
   - Kiểm tra: `java -version`
   
2. **Android SDK Command-line Tools** (Bắt buộc)
   - Download từ: https://developer.android.com/studio#command-tools
   - Giải nén vào thư mục, ví dụ: `C:\Android\cmdline-tools`

3. **Node.js**: Đã cài đặt (>=24 <25)
   - Kiểm tra: `node --version`

## Bước 1: Cài đặt Android SDK Command-line Tools

### Tải về
1. Truy cập: https://developer.android.com/studio#command-tools
2. Download "Command line tools only" for Windows
3. File tải về: `commandlinetools-win-XXXXXXXX_latest.zip` (khoảng 150MB)

### Giải nén và sắp xếp thư mục

**Bước 1: Tạo thư mục gốc**
```powershell
mkdir C:\Android
```

**Bước 2: Giải nén file ZIP**
- Giải nén file `commandlinetools-win-*.zip`
- Sau khi giải nén, bạn sẽ có thư mục `cmdline-tools` chứa các file

**Bước 3: Sắp xếp cấu trúc đúng**

⚠️ **QUAN TRỌNG**: Android SDK yêu cầu cấu trúc thư mục chính xác!

File sau khi giải nén sẽ có cấu trúc:
```
cmdline-tools/
  ├── bin/
  ├── lib/
  ├── source.properties
  └── NOTICE.txt
```

Bạn cần tạo thư mục `latest` và di chuyển nội dung vào:

**Option A: Di chuyển thủ công**
1. Tạo: `C:\Android\cmdline-tools\latest\`
2. Di chuyển TẤT CẢ nội dung từ `cmdline-tools\` vào `cmdline-tools\latest\`

**Option B: Dùng PowerShell**
```powershell
# Tạo cấu trúc
mkdir C:\Android\cmdline-tools\latest

# Di chuyển nội dung (giả sử file giải nén tại Downloads)
Move-Item $env:USERPROFILE\Downloads\cmdline-tools\* C:\Android\cmdline-tools\latest\
```

### Cấu trúc thư mục cuối cùng (đúng)
```
C:\Android\
  └── cmdline-tools\
      └── latest\                    ← Phải có thư mục "latest"
          ├── bin\
          │   ├── sdkmanager.bat    ← File quan trọng
          │   ├── avdmanager.bat
          │   └── ...
          ├── lib\
          │   └── *.jar
          ├── source.properties
          └── NOTICE.txt
```

### Kiểm tra cấu trúc
```powershell
# Kiểm tra file sdkmanager có đúng vị trí
Test-Path C:\Android\cmdline-tools\latest\bin\sdkmanager.bat
# Phải trả về: True
```

### Thiết lập biến môi trường
Thêm các biến sau vào **System Environment Variables**:

```powershell
# Thêm vào System hoặc User Environment Variables
ANDROID_HOME=C:\Android
ANDROID_SDK_ROOT=C:\Android

# Thêm vào PATH
%ANDROID_HOME%\cmdline-tools\latest\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

**Hoặc dùng PowerShell (tạm thời cho session hiện tại):**
```powershell
$env:ANDROID_HOME = "C:\Android"
$env:ANDROID_SDK_ROOT = "C:\Android"
$env:PATH += ";$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools"
```

## Bước 2: Cài đặt Android SDK Components

Sau khi thiết lập biến môi trường, cài đặt các thành phần cần thiết:

```powershell
# Chấp nhận license
sdkmanager --licenses

# Cài đặt build tools và platform
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.1"

# (Tùy chọn) Nếu cần emulator
sdkmanager "emulator" "system-images;android-36;google_apis;x86_64"
```

## Bước 3: Build APK

### Option A: Sử dụng script tự động (Khuyến nghị)

```powershell
# Từ thư mục gốc dự án
.\scripts\build-android.ps1
```

### Option B: Build thủ công từng bước

```powershell
# 1. Di chuyển đến thư mục seller app
cd apps\seller

# 2. Build web app
npm run build

# 3. Sync với Capacitor
npx cap sync android

# 4. Di chuyển đến thư mục android
cd android

# 5. Build Debug APK
.\gradlew assembleDebug

# Hoặc Build Release APK (cần keystore)
.\gradlew assembleRelease
```

## Bước 4: Tìm APK đã build

### Debug APK
```
apps\seller\android\app\build\outputs\apk\debug\app-debug.apk
```

### Release APK  
```
apps\seller\android\app\build\outputs\apk\release\app-release.apk
```

## Bước 5: Cài đặt APK lên điện thoại

### Yêu cầu
1. Bật **Developer Options** trên điện thoại
2. Bật **USB Debugging**
3. Kết nối điện thoại qua USB

### Cài đặt qua ADB

```powershell
# Kiểm tra điện thoại đã kết nối
adb devices

# Cài đặt APK
adb install apps\seller\android\app\build\outputs\apk\debug\app-debug.apk

# Hoặc cài đặt lại (ghi đè)
adb install -r apps\seller\android\app\build\outputs\apk\debug\app-debug.apk

# Gỡ cài đặt nếu cần
adb uninstall com.datt.seller
```

### Cài đặt trực tiếp
Nếu không có ADB, copy file APK vào điện thoại và cài đặt thủ công.

## Troubleshooting

### Lỗi: "sdkmanager: command not found"
- Kiểm tra biến môi trường ANDROID_HOME và PATH
- Restart PowerShell/Terminal sau khi thêm biến môi trường
- Đảm bảo cấu trúc thư mục đúng: `cmdline-tools\latest\bin`

### Lỗi: "Android SDK not found"
- Thiết lập ANDROID_HOME và ANDROID_SDK_ROOT
- Chạy: `sdkmanager --list` để kiểm tra

### Lỗi: "Failed to install the following Android SDK packages"
- Chạy: `sdkmanager --licenses` và chấp nhận tất cả licenses

### Lỗi Gradle: "Could not determine java version"
- Đảm bảo Java 11 hoặc 17 được cài đặt
- Thiết lập JAVA_HOME nếu cần

### Lỗi: "adb: device unauthorized"
- Chấp nhận USB debugging prompt trên điện thoại
- Chạy lại: `adb devices`

## Thông tin bổ sung

### Thông số build hiện tại
- **Application ID**: `com.datt.seller`
- **Min SDK**: 24 (Android 7.0)
- **Target SDK**: 36 (Android 15)
- **Compile SDK**: 36
- **Version Code**: 1
- **Version Name**: 1.0

### Gradle Commands hữu ích

```powershell
# Xem tất cả tasks
.\gradlew tasks

# Clean build
.\gradlew clean

# Build cả debug và release
.\gradlew build

# Build bundle (AAB) cho Google Play
.\gradlew bundleRelease

# Xem dependencies
.\gradlew dependencies
```

### Chạy trực tiếp từ command-line
```powershell
# Build và run trên thiết bị đã kết nối
cd apps\seller\android
.\gradlew installDebug

# Xem logs realtime
adb logcat | Select-String "DATT"
```

## Signing Release APK (Sản xuất)

Để tạo release APK cho production, cần tạo keystore:

```powershell
# Tạo keystore
keytool -genkey -v -keystore datt-seller.keystore -alias datt-seller -keyalg RSA -keysize 2048 -validity 10000

# Tạo file key.properties trong android/
# Nội dung:
storePassword=<password>
keyPassword=<password>
keyAlias=datt-seller
storeFile=datt-seller.keystore
```

Sau đó build release:
```powershell
.\gradlew assembleRelease
```
