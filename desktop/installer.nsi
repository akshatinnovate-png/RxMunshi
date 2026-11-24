; RxMunshi Windows setup (NSIS, Modern UI 2).
; Built by scripts/package-windows.mjs with native makensis:
;   makensis -DVERSION=1.0.0 -DSRC=../dist/win-unpacked -DOUT=../dist/RxMunshi-Setup-1.0.0.exe installer.nsi
; Installs per user (no admin prompt) into %LOCALAPPDATA%\Programs\RxMunshi.

Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
ManifestDPIAware true

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef SRC
  !define SRC "..\dist\win-unpacked"
!endif
!ifndef OUT
  !define OUT "..\dist\RxMunshi-Setup-${VERSION}.exe"
!endif

!define APP "RxMunshi"
!define EXE "RxMunshi.exe"
!define PUBLISHER "RxMunshi"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP}"

Name "${APP} ${VERSION}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "Software\${APP}" "InstallDir"
RequestExecutionLevel user
BrandingText "${APP} ${VERSION} · pharmacy back office"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEFINISHPAGE_BITMAP "build\installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "build\installer-sidebar.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "build\installer-header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "build\installer-header.bmp"

!define MUI_WELCOMEPAGE_TITLE "Welcome to RxMunshi ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "RxMunshi gets your expiry money back from wholesalers, keeps the Schedule H1 register inspection-ready and brings refill patients back, with you approving every step.$\r$\n$\r$\nThis app opens a demo pharmacy with made-up data. Everything stays on this computer and works without internet.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open RxMunshi now"
!define MUI_FINISHPAGE_LINK "Tip: press ? inside the app for keyboard shortcuts"
!define MUI_FINISHPAGE_LINK_LOCATION "$INSTDIR"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "build\license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "RxMunshi (required)" SecApp
  SectionIn RO
  ; close a running copy so its files can be replaced
  nsExec::Exec 'taskkill /IM "${EXE}" /T /F'
  Sleep 500
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "/oname=icon.ico" "build\icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall ${APP}.exe"

  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall ${APP}.exe"

  WriteRegStr HKCU "Software\${APP}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall ${APP}.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall ${APP}.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\${EXE}" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecApp} "The RxMunshi app. Works offline; your records stay on this computer."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop} "Put a RxMunshi icon on the desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /T /F'
  Sleep 500
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP}"
  ; the shop's records (in %APPDATA%\RxMunshi) are kept unless the user deletes them
SectionEnd
