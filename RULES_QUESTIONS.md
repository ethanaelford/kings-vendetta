# Rules questions

Every card or rule whose wording was ambiguous, with the assumption I made so the game could keep moving.
Answer in batches and I'll update the engine.

## Top questions (affect cards in the deal today)

1. **Back-row attacks.** Can a back-row card attack? *Assumed:* only Archer (by its ability) and pattern `any` / `last` / `gen` / `pos` cards
   (Catapult, Crossbow) can attack from the back row. LOS / Column / Ends / Quad / LUR / Lean / 7 / 6Q cards need to be in the front row.
2. **Juggernaut, "Roll < opponent life to kill it".** *Assumed:* the Juggernaut's attack succeeds when its roll is **lower** than the target's Life
   (an inverted roll). The other reading, "you must roll under 11 to kill the Juggernaut", would make it nearly unkillable. Which is it?
3. **Titan, "if unsuccessful then gets to switch positions with another card".** *Implemented:* it needs 3 successful hits to die.
   *Not implemented:* the position switch after a failed attack on it. Does the Titan's owner get a free swap when an attack on it fails?
4. **Armored Warrior, "Dies with opponent's snake eyes".** *Assumed:* only a raw 1+1 kills it, and Blade Dancer (one die doubled) can never kill it.
5. **Column / Ends / multi-target attacks.** *Assumed:* one roll is compared against every card in the group, and each card dies or survives separately.
   If the group includes the General and the roll fails against the General, the attacker dies, even if it killed other cards with that roll.

## Other assumptions in play

- **Stalemates.** Two Heavily Armored Soldiers facing each other can never kill each other (max roll 7 vs Life 11).
  *Added:* 30 turns in a row with no deaths ends in a draw (`STALEMATE_TURNS` in config.js). Is there a real rule for this?

- **Berserker Warrior** (Column, "Attacks twice"): two separate rolls against its column. The second roll hits whoever survived the first.
- **Archer** ("Attack choice from column"): picks either enemy card in its column (front or back) and can attack from either row.
- **Stealth Warrior** ("Can't be killed by opponent with 6 or less"): cards with base Life <= 6 can't target it at all.
- **Heavily Armored Soldier** "Attack (-5)": -5 on its own rolls (max 7). The old prototype said it couldn't attack; the spreadsheet wins.
- **Knight / Titan**: hits stick. A Knight hit once stays at 1/2 for the rest of the game.
- **General placement**: dealt into the back row (column 3), and you can move it during deploy.
- **Column shifting**: the back card advances first, then empty columns compact toward the center (configurable in `config.js`).
- **No legal attack**: a player with no legal attack passes automatically. If neither player can attack, the game is a draw.
- **Who goes first**: random, announced on both screens.

## Tier 2/3 cards added (assumptions)

- **Royal Assassin** "+5 on Royals": +5 only when attacking the **General** (the only royal in play right now).
- **Rookie** (Gen): targets the enemy General directly. Doubles kill it; anything else is a miss, so Rookie dies (General rule).
- **Fallen Knight**: +1 Life after each kill (Life goes up, so it gets harder to kill).
- **Spartan**: permanent +1 to its rolls for every enemy card killed by anyone on its team.
- **Unstable Titan**: permanent +1 to its rolls each time it attacks without killing anything.
- **Elite Assassin** "Auto-kill all cards he attacks with < life": automatically kills any non-General target with lower Life than the Assassin (6).
- **Fire Sentinel** "Killing opponent is killed (exc. General)": whoever kills it also dies, unless the killer is a General.
- **Wizard**: one roll against its LOS target plus every card in that same row with the same Life.
- **Horse Mounted Troop** "Jump and attack card and card behind": attacks both cards in its column with one roll, and can attack from the back row.
- **Hammer Dwarf** (Quad) / **Ranger** (7): one roll against the whole shape. If it kills fewer than 2 cards, the attacker dies.
- **General's Bodyguard**: while it's alive, the enemy can't target your General.
- **Wisp**: +1 to its roll per Wisp-family card on its side (including itself). **Neon Wisp**: +2 to every Wisp-family attacker on its side.
- **Blood Hound** (LUR), **Cannon** (Lean), **Avenger** (Last): pattern only.
- **Guardian** was left out: "can't kill any card until this card is dead" combined with LOS could leave a player with no legal attack for many turns.

## Waiting for later sessions (ready: false)

- Grim Reaper (Life "D"), Bounty Hunter (Life "Inf"), Morphing Warrior (Life "?"): special-Life cards.
- Kings Knight, Strategic Warrior, War Captain, Dark Knight, General's Guard, Wisp Major, Centurion, Phoenix, Field Marshall:
  multi-turn charges, rounds, or summons.
- "Round" is used in several cards (General: "If killed Round is won by opponent"). Is a game several rounds? *Assumed:* one round = one game.
- Royal Assassin "+5 on Royals": which cards count as Royal? (General? Kings Knight? General's Guard?)
- Wizard "same life on row": the row of the LOS target, or the whole exposed row?
- Bomb Expert "(reset: 3)": a 3-turn cooldown, or the marks clear after 3 turns?
- Cobalt Knight "Attacks each card with LOS life (+1)": the cards whose Life equals the LOS target's Life + 1?
- Peasant Mob "Can't pick previous roll": the previous roll of this card, or of any card?
- Ent "Shields 1 surrounding card": the owner chooses which card? What does a shield block (one successful hit)?
- Spy "Disguised as militia": is the card shown to the enemy as Militia until it attacks?
