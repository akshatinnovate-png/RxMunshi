#!/usr/bin/env bash
# Builds dist/RxMunshi-<version>.apk without Gradle, from the static export in out/.
# Needs a JDK and the Android command-line tools: on Ubuntu
#   apt install android-sdk-platform-23 android-sdk-build-tools apksigner zipalign aapt dalvik-exchange
# Signing: uses android/release.keystore (created on first run). KEEP IT: updates
# must be signed with the same key. Override with KEYSTORE, KS_PASS, KS_ALIAS.
set -euo pipefail
unset JAVA_TOOL_OPTIONS _JAVA_OPTIONS 2>/dev/null || true
cd "$(dirname "$0")"

SDK="${ANDROID_SDK:-/usr/lib/android-sdk}"
JAR="$SDK/platforms/android-23/android.jar"
BT="${BUILD_TOOLS:-$SDK/build-tools/debian}"
VERSION="$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)"
KEYSTORE="${KEYSTORE:-release.keystore}"
KS_PASS="${KS_PASS:-rxmunshi}"
KS_ALIAS="${KS_ALIAS:-rxmunshi}"
OUT="../dist/RxMunshi-${VERSION}.apk"

[ -f "$JAR" ] || { echo "missing $JAR"; exit 1; }
[ -d ../out ] || { echo "run npm run build:static first"; exit 1; }

rm -rf build && mkdir -p build/gen build/obj build/dex build/assets ../dist
cp -r ../out build/assets/web

echo "· resources"
"$BT/aapt" package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$JAR"

echo "· compile"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -encoding UTF-8 \
  -d build/obj $(find build/gen src -name '*.java')

echo "· dex"
"$BT/dx" --dex --min-sdk-version=21 --output=build/dex/classes.dex build/obj

echo "· package"
# aapt skips names starting with "_" by default, which would drop Next.js's _next/ folder
"$BT/aapt" package -f -M AndroidManifest.xml -S res -A build/assets -I "$JAR" \
  --ignore-assets '!.svn:!.git:!.DS_Store:!*~' \
  -0 woff2 -0 png -0 ico -F build/unaligned.apk build/dex

"$BT/zipalign" -f -p 4 build/unaligned.apk build/aligned.apk

if [ ! -f "$KEYSTORE" ]; then
  echo "· creating signing key $KEYSTORE (back it up)"
  keytool -genkeypair -noprompt -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KS_ALIAS" -keyalg RSA -keysize 3072 -validity 10000 \
    -dname "CN=RxMunshi, O=RxMunshi, C=IN" 2>/dev/null
fi

echo "· sign"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" \
  --min-sdk-version 21 --out "$OUT" build/aligned.apk
"$BT/apksigner" verify --min-sdk-version 21 "$OUT"
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
