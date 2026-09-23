# Environment State

*Last Updated: 2026-09-23*

## 1. Operating System & Hardware Context
- **Host OS**: Windows 11 / Windows Server x64
- **Shell**: PowerShell 5.1 / Core
- **Working Directory**: `d:\bin\projects\MMA 5 m`

## 2. Toolchain State
- **Git**: `2.52.0.windows.1`
- **Java Virtual Machine**: Microsoft OpenJDK `17.0.17+10-LTS` (Java 17 64-Bit)
- **Gradle**: Will be embedded via Gradle Wrapper (`gradlew`, `gradlew.bat`) at Gradle version 8.4+
- **Android Target**: Android 14 (API 34)
- **Android Minimum SDK**: Android 7.0 (API 24 - Nougat)
- **Build Target**: Remote automated builds via GitHub Actions Ubuntu runner (`ubuntu-latest`) with Temurin JDK 17 and Android SDK Tools.

## 3. Physical Device Context
- **Connected Hardware**: No physical Android phone currently mounted via USB ADB on host.
- **Physical Testing Method**: APK artifact produced by GitHub Actions -> User downloads `app-debug.apk` directly to physical phone -> Installs and follows testing protocol.

## 4. Active Service / Port Mappings
- **Local Dev Servers**: None required locally (standalone Android project).
- **Outbound HTTP**: Standard HTTPS ports (443) for Gradle dependencies and signal transmission.
