# 📋 Feature Requests & Limitations

> **STALE — archived for reference only.** This file predates the current direction and the team's move to Privy + MagicBlock VRF. Individual checkboxes may no longer reflect reality. For current scope and priorities, see [DIRECTION.md](DIRECTION.md).

## 🎯 **Feature Requests**

- [ ] Create inventory state controller for shop purchases
  - When user buys item in shop, add to ingredient selector inventory
  - Connect shop checkout to ingredient selector state
  - Handle currency deduction and inventory updates

- [ ] Implement proper NFT minting (replace test transactions)
  - Connect to Solana devnet for actual NFT creation
  - Handle transaction confirmation and error states

- [ ] Set up Firebase database for in-game currency tracking
  - Store user's in-game currency balance
  - Track Solana purchases and currency conversion
  - Sync currency across app sessions

- [ ] Gallery: Add two badges (need clarification on which badges)
- [ ] Crafting System: Implement Cloud Cake recipe
  - Combine Nova Egg, Pink Sugar, Mira Berry (already in shop)
  - Add crafting interface to combine ingredients

- [ ] Feeding: Redirect to inventory for ingredient selection
  - Connect feeding button to ingredient selector

- [ ] Sleep: Implement Pokemon Sleep reference
  - Add pet floating on pillow animation
  - Add "WAKE UP!" button at bottom
  
- [ ] UI Improvements: Add shading to buttons and screen for depth
- [x] Layout: Divide interaction screen buttons into 2 rows (4 buttons each)
- [x] Fix Safe Area Bleeding: Adjust cosmic inventory, shop, and feeding screens
  - Move content away from safe zones (top/bottom edges)
  - Use inner screen view boundaries instead of full screen?
  - Prevent content from bleeding into status bar/navigation areas

- [x] ✅ **InnerScreen Border & Shadow System** - COMPLETED
  - Updated InnerScreen to use rounded corners (20px radius) instead of pixelated borders
  - Implemented soft orange gradient outer shadows (5px spread) for depth
  - Added subtle black border with opacity (rgba(0, 0, 0, 0.3))
  - Removed complex inner shadow system - kept design simple and elegant
  - Created shadow container structure to properly layer shadows outside the main screen
  - Result: Clean, modern look that matches reference image style

- [x] Consistent Border Scheme: Fix remaining dialog box framing
  - Standardize border styles across remaining screens
  - Ensure consistent rounded border system
  - Match dialog boxes with inner screen border design

- [ ] Consistent Font Theme: Standardize typography across the app
  - Use PressStart2P font consistently for all text elements
  - Ensure proper font sizing and spacing
  - Maintain retro aesthetic across all components

---

## 🚨 **Current Limitations & Blockers**

## 📱 **Immersive Mode**
**Request**: Hide navigation bar completely for full-screen experience
**Current**: Status bar hidden, nav bar transparent
**Why Not Full**: Requires ejecting from Expo managed workflow, would make managing the project 
more dificult in its current state
**Tried**: `react-native-immersive` - incompatible with Expo managed workflow

## 🎨 **UI Text Underlines**
**Request**: Make underlines under "Yes" and "No" buttons bolder/thicker
**Current**: Using font underline (textDecorationLine: 'underline')
**Why Not Custom**: Would require creating custom underline components with View/Line elements
**Impact**: Custom underlines harder to maintain and position consistently
**Tried**: Font underline only allows on/off, no thickness control

## 💰 **Wallet Compatibility**

- **Phantom Wallet**: Attempted fallback signing approach but still doesn't work properly. Phantom wallet opens but doesn't prompt for transaction signature. Solflare remains the primary supported wallet.

---

*Last Updated: [Current Date]*
*Focus: What we can't do and why* 