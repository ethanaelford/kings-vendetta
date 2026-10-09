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

## Batch B (statuses, bonus attacks, dice) - assumptions

- **Status timing:** "for N turns" means the affected card's owner's next N turns.
- **Ice Sentinel**: when an attack on it fails, the attacker and the card behind the attacker are frozen (can't attack) for 2 turns.
- **Lava Guardian**: when an attack on it fails, the attacker gets -1 on its next turn and Lava Guardian gets +1 on its next turn.
- **Thunder Warrior**: instead of rolling, gives its LOS target -8 on its rolls for 2 turns, then Thunder Warrior dies.
- **Elephant Mounted Warrior**: whoever kills it has Life 4 for 2 turns (even the General).
- **Venom Warrior**: on a kill, the dead card's neighbours (left, right, front/back) have their Life halved, rounded up, permanently.
  "(reset: 1)" means it can't trigger again until it has skipped a turn. Generals are immune.
- **The Supplier**: never attacks. Its neighbours get +2 on their rolls and +1 Life ("to Max" ignored).
- **Apprentice**: always reuses the last dice roll made in the game, by either player. The odds show 0% or 100%.
- **Magma Knight**: roll + 1/3 of the roll, rounded down (a 9 becomes 12).
- **Tactical Ninja**: rolls three times and keeps the best.
- **Stone Golem**: when it's your only card left besides the General, every enemy card except their General dies (once per game).
- **Major**: when killed, every card on the killer's team with the killer's Life dies (the killer too). Generals are spared.
- **Dragon Ninja**: immune to freeze, debuffs, Life changes (Elephant), and Venom.
- **Spy**: shown to the opponent as Militia until it attacks. It kills the General instantly when the General is in its line of sight.
- **Frost Giant**: if it survives an attack, it gets an immediate free attack. Then its owner takes their normal turn.
- **Elf Rampager / Light Dragon / Elf Blitz Warrior**: after a kill, they may attack again (optional, there's a Skip button).
  Elf Blitz "can't kill partial column": if the roll doesn't kill every card in the column, none die.
- **Hog Mounted Brute**: after a kill, one free attack on any enemy card (no chaining).

## Batch C (companions, poison, marks) - assumptions

- **"Attacks with him" cards use the leader's roll.** Each companion attacks its own LOS target, keeps its own bonuses, and is subject to the General rule.
  - **Commander**: the left and right neighbours in its row join in.
  - **Captain**: every Horse Mounted Troop joins (attacking its column). If there are none, one neighbour joins.
  - **Tactical Warrior**: the card behind it attacks the enemy card behind its opponent.
  - **Admiral**: every other card in its row joins.
  - **Wisp Captain**: every other Wisp attacks the enemy card in its identical slot.
- **Wolf Mounted Dwarf**: the game auto-picks "attack twice" or "+2", whichever has the better kill chance. Should the player choose?
- **Poison** = -1 Life per turn for 3 turns (never below 2).
  - **Hydra**: 3 hits to kill, +2 on its rolls. Anyone who fails against it, or survives its attack, is poisoned.
  - **Lightning Mage**: the target's neighbours get poisoned.
  - **Chemical Warfare Warrior** (Any): no roll; the target is poisoned and paralyzed for 3 turns.
- **Fire Striker**: a target that survives gets -2 on its rolls for 2 turns.
- **Redstone Warrior**: the 3rd time it attacks the same card, that card dies automatically (not the General).
- **Peasant Mob**: best of 3 rolls, but not the same total it picked last time.
- **Bomb Expert**: attacks any card, plus every card it failed to kill in the last 3 turns, with one roll.
- **Ace**: one roll; every enemy card with exactly that Life dies. The General is excluded. Should it be?
- **Fire Sprite**: cards with any roll bonus (Minotaur, Spartan, Wisps, ...) can't attack it.
- **Samurai**: after each attack, armours one neighbour (+1 hit to kill), the General first, else the highest Life. Permanent.
- **Ent**: shields one neighbour (the General first) from one successful hit, once per game.
- **Reviver**: on a kill, revives the highest-Life card from its own graveyard into an empty slot.

## Batch D (movement, experts, gambles) - assumptions

- **Foot Soldier**: once per game, uses its turn to switch places with a neighbouring ally (left, right, or front/back).
- **Medic**: can attack normally, or use its turn to cleanse one ally of freeze, debuffs, poison, Life changes and marks.
- **Lightning Ninja**: can dash to any column where it has a front-row ally (switching places), then attack that column's LOS target.
- **Eagle Warrior**: once per game, pulls any enemy card except the General into its line of sight
  (the pulled card switches places with the enemy card that was there), then attacks it.
- **Unstable Bomb Expert**: normal LOS attack, or **Hail Mary**: roll exactly 7 (1 in 6) and you win the game; any other roll and you lose it.
  Is "loses" really the whole game, or just the Bomb Expert?
- **Cobalt Knight**: one roll against its LOS target plus every enemy card whose Life is the LOS target's Life + 1.
- **Corrupt Commander** (6Q): attacks the 6 opposite cards with one roll. Each touching ally then makes its own roll against the same 6, with no bonuses or powers.
- **Ranged / Melee Expert**: "ranged" = Archer, Catapult, Crossbow, Cannon, Ranger, Iron Giant, Bomb Expert. Every other non-General card is "melee".
  - Ranged Expert gives ranged allies +1 Life, +3 to their rolls, and two attacks.
  - Melee Expert gives melee allies +3 Life, +1 to their rolls, and makes them need 2 hits to kill (on top of Knight/Titan hits).
  - The bonuses last while the Expert is alive. Which cards count as ranged?

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
