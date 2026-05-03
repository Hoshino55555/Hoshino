# Cutting a Release

The repeatable steps to ship a new `0.1.x-preview` build to GitHub Releases
with the APK attached. Targets Android only (no iOS pipeline yet).

## When to cut a release

Whenever a build is ready to hand off to testers / hackathon judges:
- Features are merged on `main` and verified on a connected device.
- Backend (Firebase Functions) is already deployed if any callables changed —
  release the APK *after* the server is live, otherwise installs will hit
  errors against missing endpoints.

Releases keep the `-preview` suffix in the title and tag, but **do not**
pass `--prerelease` to `gh release create`. GitHub's "Latest" badge
auto-skips prereleases, so flagging preview builds as prerelease leaves
sideloaders downloading a stale APK from the old non-preview cut. Drop
the suffix entirely once we ship the first non-preview build.

## Versioning

Three places to bump in lockstep:

| File | Field |
|------|-------|
| `android/app/build.gradle` | `versionCode` (integer, +1) and `versionName "0.1.x-preview"` |
| `app.json` | `"version": "0.1.x-preview"` |

`package.json` `"version"` is unrelated to the app version and stays at `1.0.0` —
do not touch it.

The git tag is `v<versionName>` (e.g. `v0.1.13-preview`).

## Pre-flight

```bash
# 1. Type check
npx tsc --noEmit

# 2. Working tree clean of stray files (especially scratch scripts in
#    backend/firebase/functions/scripts/_*.js)
git status --short

# 3. If functions changed, confirm they're deployed and have public invoker.
#    New callables need `roles/run.invoker` for `allUsers` or the client
#    will get 401 with no visible error in release builds. Run for each
#    new function:
gcloud functions add-invoker-policy-binding <fnName> \
  --region=us-central1 --project=hoshino-996d0 --member=allUsers
```

## Steps

```bash
# Bump versions
# (edit android/app/build.gradle + app.json by hand or with sed)

# Commit
git add android/app/build.gradle app.json <other changed files>
git commit -m "feat: <one-line summary>

<paragraph describing the release>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

# Push the commit
git push origin main

# Tag
git tag -a v0.1.x-preview -m "Release 0.1.x-preview

<bullet list of headline features>"
git push origin v0.1.x-preview

# Build the signed release APK
cd android && ./gradlew assembleRelease && cd ..

# Verify version landed in the APK
$ANDROID_HOME/build-tools/36.0.0/aapt dump badging \
  android/app/build/outputs/apk/release/app-release.apk | head -1
# expect: package: name='com.socks.hoshino' versionCode='<N>' versionName='0.1.x-preview' ...

# Publish the GitHub release with the APK attached. Do NOT pass
# --prerelease — see "Versioning" above for why preview builds still
# need the Latest badge.
gh release create v0.1.x-preview \
  --title "0.1.x-preview · <one-line summary>" \
  --notes-file /tmp/release-notes-0.1.x.md \
  android/app/build/outputs/apk/release/app-release.apk
```

## Release notes template

Save to `/tmp/release-notes-0.1.x.md` before running `gh release create`:

```markdown
## Hoshino 0.1.x-preview

<one-paragraph summary>

### What's new
- ...

### Coming soon (still gated)
- ...

### Install
Download `app-release.apk` below and sideload onto an Android device.
- versionCode: **N**
- versionName: **0.1.x-preview**
- Min Android: 7.0 (SDK 24)
```

## Smoke checklist (post-install)

Sanity-check the release APK on a real device before announcing:

- [ ] Cold boot → splash → home → no auth/profile loop
- [ ] Shop opens, all three tabs render, wallet balance loads from server
- [ ] Daily Spin card animates and grants a reward (use
      `node backend/firebase/functions/scripts/reset-daily-spin.js <uid>` to
      bypass cooldown if you've already claimed today)
- [ ] Hackathon Special card grants +10,000 SF (remove this card before
      a public launch)
- [ ] Cooking flow: pick ingredients → cook → result reflected on the
      Moonoko's hunger bar
- [ ] Inventory page lists owned ingredients

If any item fails, tag a `0.1.x.1-preview` patch — don't reuse the same tag.
