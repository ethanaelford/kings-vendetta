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
