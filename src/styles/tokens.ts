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
    gold: '#E8B84A',         // 9× — duller brown-gold, prices/rewards/badges
    goldBright: '#FFD700',   // 7× — bright pure gold for highlights/sparkles
    goldWarm: '#f4d35e',     // 21× combined — mid warm yellow; collapses
                             //   #f5d65f/#ffd54f/#f5dd4b drift into one tone
    purpleBg: '#1a1033',     // 10×, 5 files — dark purple modal background tint
    purpleText: '#2d1b69',   // 17×, 3 files — purple body text on light bg
    purpleMid: '#5a4a8a',    // 5× — mid lavender, sleep/login decorations
    purpleDark: '#3a225e',   // 6× combined (#3a225e + #3d2a5e) — modal stroke
    slotInk: '#3a2a1a',      // 15×, 3 files — dark brown ink on painted slot art
    error: '#e87a7a',        // 4× — cancel-button / below-min coral-red
    inkDark: '#1a1a1a',      // 11× — dark surfaces (chat bubbles, settings panels)
    inkMid: '#2a2a2a',       // 7× combined (#2a2a2a/#3a3a3a/#4a4a4a) — borders/contrast
    inkText: '#666666',      // 9× combined (#666/#888/#999999/#9a9a9a/#8b8b8b/#767577)
                             //   — mid-grey body text (chat metadata, disabled states)
    inkLight: '#cccccc',     // 2× combined (#ccc/#d4d4d4) — light borders/dividers
} as const;

// DOS-terminal palette used by the retro Shop screen + its receipt summaries.
// Stays in a sub-palette (not on `colors`) because these values only make
// sense as a coordinated set — bare names like "greenDark" on the main token
// would invite accidental cross-use in unrelated components.
export const terminalGreen = {
    bgDeep: '#001100',    // 14× — deepest CRT background fill
    bgMid: '#003300',     // 16× — panel/card fill
    accent: '#006600',    // 16× — text + borders
    ok: '#00aa00',        // 2× — affordable/positive state
    err: '#cc0000',       // 1× — error/over-budget state
} as const;

// Font-family tokens. `body` is the workhorse used by ~150 text/button
// sites; `pixel` is the chunkier display face used in titles, badges,
// game UI. `pixelAlt` covers a handful of slot-art labels that use a
// different pixel font on purpose. Bare strings still ship at the
// font-rare call sites (PressStart2P intro screen, MacMinecraft watermark).
export const fonts = {
    body: 'Monaco',           // 152× — primary text/button face
    pixel: 'PressStart2P',    // 20× — display pixel face, titles/badges
    pixelAlt: '04b03',        // 6× — secondary pixel face for slot-art labels
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
