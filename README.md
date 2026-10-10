# King's Vendetta

A medieval card-battle game designed by the Ford family since 2015. Static HTML/CSS/JS with no build step.

## Play
- **Online 1v1:** Create Game → share the link (or the 4-letter code) → both players deploy → Ready → battle.
- **Pass & Play:** two players on one device.
- **vs Computer:** a simple AI opponent.
- Add to Home Screen on iPhone (Share → Add to Home Screen) to open it full-screen.

## Develop
- `python tools/build_cards.py` regenerates `js/cards.data.js` from `reference/Cards-Excell.xlsx` (Sheet2).
- `python tools/slice_sprites.py` slices `reference/sprites.png` into `images/sprites/`.
- Edit `images/sprites/sprite-map.json` to re-point a card's portrait, then rerun `build_cards.py`, which refreshes `js/sprite-map.js`.
- Put custom art at `images/cards/<slug>.png` (see `images/cards/README.md`) and rerun `build_cards.py`.
- `node tests/run.js` runs the rules tests.
- `bash tools/deploy.sh` stamps the build, runs the tests, commits, and pushes.

## Online notes
Online play uses Supabase Realtime **broadcast + presence** only (no database tables, no accounts).
The anon key in `config.js` **is meant to be public**. It can only join realtime channels. Never put the
service_role key in client code. The DB password from project creation lives in the git-ignored `.env.local`.

The host's phone runs the rules engine and rolls all the dice. The guest sends intents only.
The host saves the game to localStorage after every action, so a reload resumes the game.

## Files
- `js/rules.js`: pure rules engine (state, targeting, rolls, compaction, win check)
- `js/abilities.js`: per-card ability hooks
- `js/ui.js`: rendering, input, game modes
- `js/net.js`: Supabase multiplayer
- `js/ai.js`: computer opponent
- `js/art.js`: art lookup (override → sprite → SVG crest)
- `config.js`: rule toggles + Supabase settings

## Progression (stored per device)
- New players own 20 starter cards (the 20 weakest ready cards) plus the General. Their deck is those 20.
- **Deck & Cards:** pick up to 20 owned cards. A game deals your General plus 11 random cards from your deck.
- **Chests** after every online or vs-computer game: Wooden, Silver or Golden. Better odds when you win.
  A chest gives coins or unlocks a card you don't have yet.
- **Rarity** = Life + ability strength (`ABILITY_WEIGHT` in `tools/build_cards.py`), split into Common, Uncommon, Rare, Epic and Legendary.
- **Coins** buy board themes in Profile & Shop.
- **Elo:** starts at 1000, K=32, ranked matches only. Tiers: Bronze, Silver (950), Gold (1100), Platinum (1250), Diamond (1400),
  and **Mythic** = Diamond rating plus a top-100 spot on the shared leaderboard.
- **Backup code** in Profile moves your progress to another device. iPhone Safari can erase site data after 7 days unused,
  so use Add to Home Screen.

## Rules toggles (config.js)
- `TURN_SWAP`: switch two of your cards instead of attacking (`'any'` / `'adjacent'` / `'off'`)
- `WIN_BY_WIPE`: you also win by killing every enemy card except their General
- `STALEMATE_TURNS`: this many turns in a row with no kill = draw
- `MAX_LIFE`: hard cap on any card's Life (12)
- `LOS_NEAREST`: a card facing an empty enemy column aims at the nearest enemy column instead
- The chess clock is picked in the lobby (ranked is always 10 minutes). Running out of time loses.

## Campaign, upgrades, forfeits
- **Campaign** (`js/campaign.js`): 8 themed computer opponents. Each stage has its own deck, AI sharpness (`noise`), enemy General level and enemy card level.
  The first clear of a stage pays coins plus a chest and unlocks the next stage. Stage 8 is the boss (General at the Life cap of 12, sharpest AI).
- **Upgrades:** chests can give spare copies of cards you own. Level 2 = 2 copies + 100 coins, level 3 = 4 copies + 300 coins. Each level is +1 Life.
  Your levels apply in vs-computer, campaign and online games.
- **Leaving a live game** (Menu → Leave game) forfeits: you take a loss (with no chest), and the opponent gets the win screen.
  Pass & Play has no forfeit. Just closing the app is not a forfeit; the opponent sees "disconnected".

## Accounts & cloud save
- **Username + password** (Profile → Account). No email: a username maps to a private placeholder address
  (`<username>@players.kingsvendetta.app`), and email confirmation is turned off in `supabase/config.toml`.
- While signed in, the profile (cards, levels, coins, Elo, campaign, themes) syncs to the `kv_profiles` table, which is row-locked to each user.
  On a new device the cloud save is loaded. If both have progress, the player chooses which to keep.
- Passwords can't be reset by email. An admin can reset one in the Supabase dashboard (Authentication → Users).
- Google sign-in is built in but disabled. To enable it, set `GOOGLE_SIGNIN: true` in config.js, set `enabled = true` under
  `[auth.external.google]`, add the keys to `.env.local`, and run `tools/push_auth_config.ps1`.

## Custom portraits
`reference/sprites2.webp` (a labelled sheet) is sliced by `tools/slice_sprites2.py` into `images/cards/<slug>.png`.
Those override the original sprite sheet; then rerun `tools/build_cards.py`.

## Terrain, events, heroes (config.js: TERRAIN, EVENTS, EVENT_EVERY, HEROES)
- **Terrain:** 2-3 of the 6 board columns get terrain each game. It belongs to the column, so cards gain or lose it as the columns shift.
  Hill: +1 to rolls from here. Swamp: -1 to rolls from here. Fortress: +1 Life. Scorched: -1 Life.
  Forest: cards here can only be attacked from the same column. Tap the column icon in-game for details.
- **Events:** every 6 turns. Thunderstorm (-1 rolls), Clear Skies (+1), Thick Fog (ranged -3), Reinforcements, Plague, Healing Spring,
  Earthquake (new terrain), Meteor Shower.
- **Classic battlefield** (lobby setting): no terrain and no events, for private, vs-computer and pass & play games. Ranked is always Dynamic.
- **Hero Generals:** pick one during deploy; each power works once per game. Warlord (War Cry +2 this turn), Tactician (free swap),
  High Priest (restore your army), Executioner (destroy an enemy card with Life <= 6; uses the turn).

## Ranks, chests & cosmetics (art: reference/sprites3.png -> tools/slice_sprites3.py -> images/ui/)
- **Ranks:** Bronze, Silver 950, Gold 1100, Platinum 1250, Diamond 1400, Master 1500, Grandmaster 1600,
  and **Legendary** = Grandmaster plus a top-100 leaderboard spot.
- **Chests:** Wooden, Silver, Golden, Epic, Legendary (won). Royal, Frost and Infernal can be bought in the Shop.
- **Shop:** 14 board themes (terrain tiles), 8 card frames, 6 dice skins, 3 chests.
