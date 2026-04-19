#!/usr/bin/env bash
#
# Build a signed release APK and publish it as a GitHub release.
#
# Usage:
#   bash scripts/release.sh <version>           # e.g. 0.1.1-preview
#   bash scripts/release.sh <version> --draft   # don't publish, keep as draft
#   bash scripts/release.sh <version> --notes "Custom notes"
#
# Requirements:
#   - gh CLI authenticated (`gh auth status`)
#   - ANDROID_HOME pointing at an SDK, or android/local.properties set
#   - Clean working tree (script will refuse to proceed if dirty, unless --force)

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: bash scripts/release.sh <version> [--draft] [--notes \"...\"] [--force]" >&2
  echo "  e.g. bash scripts/release.sh 0.1.1-preview" >&2
  exit 1
fi
shift

TAG="v${VERSION}"
DRAFT=""
FORCE=""
CUSTOM_NOTES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --draft) DRAFT="--draft"; shift ;;
    --force) FORCE="1"; shift ;;
    --notes) CUSTOM_NOTES="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$FORCE" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working tree has uncommitted changes. Commit first or pass --force." >&2
    git status --short
    exit 1
  fi
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists locally. Delete it or pick a new version." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]] && [[ -f android/local.properties ]]; then
  SDK_FROM_PROPS=$(grep -E '^sdk.dir=' android/local.properties | cut -d= -f2- || true)
  if [[ -n "$SDK_FROM_PROPS" ]]; then
    export ANDROID_HOME="$SDK_FROM_PROPS"
  fi
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "ANDROID_HOME is not set and android/local.properties has no sdk.dir." >&2
  exit 1
fi

BUILD_GRADLE="android/app/build.gradle"
CURRENT_CODE=$(grep -E '^\s*versionCode\s+[0-9]+' "$BUILD_GRADLE" | head -1 | awk '{print $2}')
NEXT_CODE=$((CURRENT_CODE + 1))

echo "==> Bumping versionCode: $CURRENT_CODE -> $NEXT_CODE"
echo "==> Setting versionName: $VERSION"

# macOS sed -i needs an empty extension arg; keep it portable.
/usr/bin/sed -i '' -E "s/versionCode[[:space:]]+[0-9]+/versionCode $NEXT_CODE/" "$BUILD_GRADLE"
/usr/bin/sed -i '' -E "s/versionName[[:space:]]+\"[^\"]*\"/versionName \"$VERSION\"/" "$BUILD_GRADLE"

echo "==> Building release APK (this takes ~5 min)"
pushd android >/dev/null
./gradlew assembleRelease
popd >/dev/null

SRC_APK="android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$SRC_APK" ]]; then
  echo "Expected APK not found at $SRC_APK" >&2
  exit 1
fi

OUT_APK="/tmp/hoshino-${TAG}.apk"
cp "$SRC_APK" "$OUT_APK"
APK_SIZE=$(du -h "$OUT_APK" | cut -f1)
echo "==> APK ready: $OUT_APK ($APK_SIZE)"

echo "==> Committing version bump"
git add "$BUILD_GRADLE"
git commit -m "chore(android): bump to $VERSION (versionCode $NEXT_CODE)"

echo "==> Tagging $TAG"
git tag "$TAG"

if [[ -n "$CUSTOM_NOTES" ]]; then
  NOTES="$CUSTOM_NOTES"
else
  NOTES=$(cat <<EOF
Hoshino $TAG preview build.

Install on an Android phone (including Seeker) by following [docs/INSTALL_APK.md](https://github.com/Hoshino55555/Hoshino/blob/main/docs/INSTALL_APK.md).

APK size: $APK_SIZE
versionCode: $NEXT_CODE
EOF
)
fi

echo "==> Pushing commit + tag"
git push origin HEAD
git push origin "$TAG"

echo "==> Creating GitHub release"
gh release create "$TAG" "$OUT_APK" \
  --title "Hoshino $TAG" \
  --notes "$NOTES" \
  $DRAFT

echo ""
echo "Done. Release URL:"
gh release view "$TAG" --json url --jq .url
