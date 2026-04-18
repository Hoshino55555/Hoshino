# Starburst Game Implementation - TODO

## Game Overview

Starburst (also known as Voltorb Flip in Pokémon HeartGold/SoulSilver) is a logic puzzle minigame that replaces slot machines. The game is now integrated into the Hoshino project's character menu system.

### Game Mechanics

- **5×5 grid** of 25 squares
- Each square contains: **Star (0)**, **1**, **2**, or **3**
- **Goal**: Flip all **2s and 3s** without hitting a Star
- **Score**: Product of all flipped numbers (multiplied together)
- **Game Over**: Hitting a Star (0) ends the game immediately and you lose all points
- **Win Condition**: Flip all 2s and 3s on the board

### Clues System

Each row and column shows two numbers:
- **Top number**: Sum of all numbers in that row/column
- **Bottom number**: Count of Stars in that row/column

Players use logic to determine which squares are safe to flip based on these hints.

### Strategy Rules (Reference from Voltorb Flip Guide)

1. **No Star**: If a row has 0 Stars, flip the whole row (all safe)
2. **Only Star**: If a row is 0/5 (5 Stars, sum 0), mark all as Stars
3. **Total Five**: If total + Stars = 5, all non-Star squares are 1s
4. **Four Stars**: If 4 Stars, only one number square exists (equals the total)
5. **Total Six**: If total + Stars = 6, eliminate 3s (must be 2s and 1s)
6. **Too High for 1s**: Eliminate 1s when math doesn't allow them
7. **Eliminate the Impossible**: Use process of elimination with markers

## Implementation Plan

### Project Structure
- React Native/Expo project
- TypeScript
- Uses PressStart2P font for retro aesthetic
- Green color scheme (#2E5A3E, #E8F5E8)
- Components in `src/components/`
- Character menu system in `MoonokoInteraction.tsx`

### Integration Points
- Main character menu has a "Games" button
- Clicking Games button shows a games list modal
- Starburst is listed as an available game
- Selecting Starburst launches the game
- Game can be exited to return to games list or character menu

## Completed Tasks ✅

- [x] Create GamesList.tsx component with modal UI showing Starburst game option
  - Modal component displaying available games
  - Shows "Starburst" as selectable game option
  - Styled to match existing modals (similar to MoonokoSelection modal pattern)
  - Handles game selection and closes modal
  - Location: `src/components/GamesList.tsx`

- [x] Create Starburst.tsx with basic playable game logic
  - 5x5 grid with hidden values (0=Star, 1, 2, 3)
  - Row/column hints (sum and Star count)
  - Click to flip squares and reveal values
  - Score calculation (product of flipped numbers)
  - Game over on Star hit
  - Win condition: flip all 2s and 3s
  - Grid generation with valid configuration
  - Flipped squares tracking
  - Current score display
  - Game status (playing/won/lost)
  - New game button
  - Back button to return to games list
  - Location: `src/components/Starburst.tsx`

- [x] Update MoonokoInteraction.tsx to show GamesList modal when games button is clicked
  - Added state for games list modal visibility (`showGamesList`)
  - Added state for current game (`currentGame`)
  - Modified `handleMenuButtonAction` case 'games' to show GamesList modal
  - Added handlers for game navigation (show Starburst, return to list)
  - Added conditional rendering for Starburst game
  - Location: `src/components/MoonokoInteraction.tsx`

## Current Implementation Status

The game is a **proof of concept** with core gameplay mechanics. It's fully playable but intentionally minimal:
- ✅ Basic game logic works
- ✅ Grid generation creates valid puzzles
- ✅ Hints are calculated correctly
- ✅ Win/loss conditions work
- ✅ Navigation between games list and game works
- ❌ No character stats integration yet
- ❌ No multiple levels system
- ❌ No memo pad functionality for marking squares
- ❌ No score persistence
- ❌ No achievements/rewards

## Technical Details

### Files Created
- `src/components/GamesList.tsx` - Games selection modal
- `src/components/Starburst.tsx` - Starburst game implementation

### Files Modified
- `src/components/MoonokoInteraction.tsx` - Updated games button handler and added game navigation

### Key Implementation Notes
- Uses React Native Modal component for GamesList (following existing patterns)
- Uses TouchableOpacity for grid squares and buttons
- Game logic implemented with TypeScript interfaces for type safety
- Styled to match existing game aesthetic (PressStart2P font, green color scheme)
- Grid generation ensures mathematical validity (hints match actual grid contents)
- All references use "Star" instead of "Voltorb" as requested

### Grid Generation Algorithm
Current implementation uses random generation with weighted probabilities:
- 70% chance of 1
- 15% chance of 2
- 10% chance of 3
- 5% chance of 0 (Star)

Hints are calculated after grid generation to ensure they match the actual grid contents.

## Future Enhancements (Not Yet Implemented)

### Core Features
- [ ] Memo pad functionality for marking squares (mark as Star, 1, 2, or 3)
- [ ] Better grid generation algorithm (ensure solvability, difficulty levels)
- [ ] Multiple levels system (like original game)
- [ ] Score persistence across sessions
- [ ] Level progression based on performance

### Integration Features
- [ ] Character stats integration (mood/energy changes from playing)
- [ ] Rewards system (earn items/currency for winning)
- [ ] Achievements system
- [ ] Leaderboard integration
- [ ] Daily challenges

### UI/UX Improvements
- [ ] Flip animations
- [ ] Sound effects
- [ ] Visual feedback for safe/unsafe squares
- [ ] Tutorial/help system
- [ ] Settings (difficulty, hints on/off)

### Technical Improvements
- [ ] Game state persistence (save/load games)
- [ ] Undo functionality
- [ ] Hint system (highlight safe squares)
- [ ] Solver algorithm to verify puzzle solvability
- [ ] Performance optimizations

## Reference Links

- Original game guide: https://www.dragonflycave.com/johto/voltorb-flip
- Game mechanics based on Pokémon HeartGold/SoulSilver Voltorb Flip minigame
