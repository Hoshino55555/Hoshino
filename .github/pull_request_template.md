<!--
  Closes / Fixes / Resolves an issue → board auto-moves it to Done on merge.
  Drop the line if the PR isn't tied to a board item.
-->
Closes #

## Summary

<!-- 1-3 bullets on what changed and why. Skip the "what" if the diff is small enough to read. -->

-

## Test plan

<!-- Check off what you actually verified. Leave items unchecked if N/A. -->

- [ ] `npx tsc --noEmit` passes
- [ ] Tested on a connected Android device (cold boot → relevant flow)
- [ ] If touching Firebase Functions: deployed and granted public invoker (see [docs/RELEASE.md](../docs/RELEASE.md))
- [ ] If shipping a release: versionCode bumped in [android/app/build.gradle](../android/app/build.gradle) + [app.json](../app.json)

## Screenshots / video

<!-- Drag in if there's a UI change. `adb exec-out screencap -p > /tmp/shot.png` works. -->

## Notes for reviewer

<!-- Anything non-obvious, gotchas, follow-ups left for a separate PR. -->
