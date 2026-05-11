// Cross-file design tokens. Only values that appear in 3+ component
// files belong here — palette tweaks then become one-line changes
// instead of touching every stylesheet. Page-local colors (rarity
// accents, tier badges, Shop/Inventory green family, modal purples)
// stay inline in their owning stylesheet on purpose; tokenizing them
// across files would be premature abstraction.

// Usage counts captured at the time of extraction so future readers
// can judge whether a value is still load-bearing enough to be a token.
export const colors = {
    forestDark: '#2E5A3E',   // 77×, 10 files — primary text/accent green
    forestMid: '#4A7A5A',    // 15× — companion to forestDark
    mintPale: '#E8F5E8',     // 53×, 14 files — primary surface/page background
    white: '#FFFFFF',        // 24× combined — normalized from #FFFFFF/#ffffff drift
    black: '#000000',        // 14× — text shadow, hard borders
    gold: '#E8B84A',         // 9×, 3 files — prices, rewards, badges
    purpleBg: '#1a1033',     // 9×, 4 files — dark purple modal background tint
    purpleText: '#2d1b69',   // 17×, 3 files — purple body text on light bg
} as const;

// Type scale. Step values picked from the histogram of existing
// fontSize occurrences — these are the sizes already in use most.
// Off-scale values (17, 19, 23, 26, 27) survive inline at call sites
// pending a deliberate visual-snapping pass.
export const typeScale = {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 21,
    xl: 24,
    '2xl': 30,
} as const;

// Border-radius scale. Most existing radii (3, 4, 6, 8, 10, 12, 16,
// 20, 24) already cluster around these steps. Snapping pre-existing
// off-scale values is held back for a follow-up pass; this scale is
// the target going forward.
export const radius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    pill: 999,
} as const;
