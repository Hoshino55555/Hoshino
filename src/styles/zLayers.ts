// App-level z stack. One file so adding a new layer is "pick a name"
// instead of "grep for a free magic number". Both zIndex (iOS) and
// elevation (Android) MUST be set to the same value at each layer —
// when they disagree, the stack differs by platform.
//
// Local zIndex inside a single component (e.g. Frame, RoomEditor,
// WelcomeScreen) is fine to leave alone — those create their own
// stacking contexts and don't interact with this scale.
export const Z = {
    interaction: 0,      // MoonokoInteraction (home) and cavity routes
    cavity: 0,           //   (water-ring-toss) — both sit BELOW the casing
    casing: 20,          // DeviceCasing + DeviceButtons
    fullScreenRoute: 50, // Shop, Inventory, Settings, Feeding, Sleep, ...
    wallet: 90,          // WalletButton (top-right)
    notification: 9999,  // Toast overlay — always on top of normal UI
    iris: 20000,         // ZoomOutOverlay iris (must beat elevation:20)
    hardMask: 20001,     // ZoomOutOverlay end-of-transition mask
} as const;
