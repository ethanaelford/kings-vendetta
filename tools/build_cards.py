"""Build js/cards.data.js from reference/Cards-Excell.xlsx (Sheet2).

Usage:  python tools/build_cards.py
Edit the spreadsheet, rerun, reload the game.
"""
import json, os, re
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, 'reference', 'Cards-Excell.xlsx')
OUT = os.path.join(ROOT, 'js', 'cards.data.js')
IMG_README = os.path.join(ROOT, 'images', 'cards', 'README.md')

NAME_FIXES = {
    'Gaurdian': 'Guardian', 'Spartin': 'Spartan', 'Currupt': 'Corrupt',
    'Stone Golumn': 'Stone Golem', 'Mealea': 'Melee', 'Tacticial Alchamist': 'Tactical Alchemist',
    'Sentinal': 'Sentinel', 'Bodygaurd': 'Bodyguard', 'Poisioned': 'Poisoned',
}

PATTERNS = {
    'los': 'los', 'any': 'any', 'ends': 'ends', 'column': 'column', 'col': 'column', 'coll': 'column',
    'quad': 'quad', 'lur': 'forD', 'lean': 'lean', '7': 'L', 'last': 'lema', 'gen': 'general',
    '6q': 'six', 'pos': 'mirror', 'surr': 'support', 'td': 'special', '<=rv': 'special', '?': 'special',
}

# Cards whose pattern + ability are fully implemented in js/rules.js / js/abilities.js.
READY = {
    'General', 'Militia', 'Front Lineman', 'Knight', 'Titan', 'Minotaur', 'Heavily Armored Soldier',
    'Stealth Warrior', 'Juggernaut', 'Armored Warrior', 'Blade Dancer', 'Catapult',
    'Stationary Crossbow Soldier', 'Brute', 'Iron Giant', 'Archer', 'Berserker Warrior',
    # tier 2/3
    'Blood Hound', 'Cannon', 'Avenger', 'Dwarf Blitzer', 'Royal Assassin', 'Rookie', 'Fallen Knight', 'Spartan',
    'Unstable Titan', 'Elite Assasin', 'Fire Sentinel', 'Wizard', 'Horse Mounted Troop', 'Hammer Dwarf', 'Ranger',
    'Generals Bodyguard', 'Wisp', 'Neon Wisp',
    # batch B
    'Ice Sentinel', 'Lava Guardian', 'Thunder Warrior', 'Elephant Mounted Warrior', 'Venom Warrior', 'The Supplier',
    'Apprentice', 'Magma Knight', 'Tactical Ninja', 'Stone Golem', 'Major', 'Dragon Ninja', 'Spy', 'Frost Giant',
    'Elf Rampager', 'Light Dragon', 'Elf Blitz Warrior', 'Hog Mounted Brute',
    # batch C
    'Commander', 'Captain', 'Tactical Warrior', 'Admiral', 'Wisp Captain', 'Wolf Mounted Dwarf', 'Hydra',
    'Lightning Mage', 'Fire Striker', 'Chemical Warfare Warrior', 'Redstone Warrior', 'Peasant Mob', 'Bomb Expert',
    'Ace', 'Fire Sprite', 'Samurai', 'Ent', 'Reviver',
    # batch D
    'Foot Soldier', 'Medic', 'Lightning Ninja', 'Eagle Warrior', 'Unstable Bomb Expert', 'Cobalt Knight',
    'Corrupt Commander', 'Ranged Expert', 'Melee Expert',
    # batch E
    'Joker', 'Unskilled Warrior', 'The Manipulator', 'Dragon Tamer', 'Frost Brute', 'Stone Monster',
    'Tactical Alchemist', 'Guardian',
    # batch F
    'Attack Wagon', 'Centurion', 'Field Marshall', 'Phoenix', 'Kings Knight', "General's Guard", 'Bounty Hunter',
}

# Special-Life cards whose Life is handled by their ability (js/abilities.js)
READY_SPECIAL_LIFE = {'Bounty Hunter'}

# One-line "what's missing" notes for the Card Library (default: ability not built yet).
LATER = {
    'Grim Reaper': 'Special Life (D) - later session',
    'Bounty Hunter': 'Special Life (Inf) - later session',
    'Morphing Warrior': 'Special Life (?) - later session',
    'Kings Knight': 'Multi-turn charge - later session',
    'Strategic Warrior': 'Round-based choice - later session',
    'War Captain': 'Rounds / summons - later session',
    'Dark Knight': 'Rounds - later session',
    "General's Guard": 'Multi-turn resurrection - later session',
    'Wisp Major': 'Summons / refills - later session',
    'Centurion': 'Summons from deck - later session',
    'Phoenix': 'Card-pick kill - later session',
    'Field Marshall': 'Fills slots with enemy cards - later session',
    'Shadow Warrior': 'Partial life damage - later session',
}


# Ability strength (added to Life) used to rank cards into rarities. Tweak freely, then rerun.
ABILITY_WEIGHT = {
    'Militia': 0, 'Front Lineman': 0, 'Catapult': 3, 'Stationary Crossbow Soldier': 3, 'Archer': 2, 'Brute': 3,
    'Iron Giant': 3, 'Berserker Warrior': 4, 'Knight': 3, 'Titan': 4, 'Minotaur': 1, 'Heavily Armored Soldier': -3,
    'Stealth Warrior': 3, 'Juggernaut': 2, 'Armored Warrior': 7, 'Blade Dancer': 0, 'Blood Hound': 2, 'Cannon': 2,
    'Avenger': 2, 'Dwarf Blitzer': 4, 'Royal Assassin': 3, 'Rookie': 4, 'Fallen Knight': 2, 'Spartan': 3,
    'Unstable Titan': 2, 'Elite Assasin': 4, 'Fire Sentinel': 4, 'Wizard': 3, 'Horse Mounted Troop': 2,
    'Hammer Dwarf': 1, 'Ranger': 1, 'Generals Bodyguard': 5, 'Wisp': 1, 'Neon Wisp': 1, 'Ice Sentinel': 3,
    'Lava Guardian': 1, 'Thunder Warrior': 2, 'Elephant Mounted Warrior': 3, 'Venom Warrior': 3, 'The Supplier': 2,
    'Apprentice': 2, 'Magma Knight': 3, 'Tactical Ninja': 4, 'Stone Golem': 6, 'Major': 3, 'Dragon Ninja': 1, 'Spy': 7,
    'Frost Giant': 3, 'Elf Rampager': 4, 'Light Dragon': 4, 'Elf Blitz Warrior': 3, 'Hog Mounted Brute': 3,
    'Commander': 3, 'Captain': 2, 'Tactical Warrior': 2, 'Admiral': 4, 'Wisp Captain': 2, 'Wolf Mounted Dwarf': 3,
    'Hydra': 5, 'Lightning Mage': 2, 'Fire Striker': 2, 'Chemical Warfare Warrior': 4, 'Redstone Warrior': 3,
    'Peasant Mob': 4, 'Bomb Expert': 3, 'Ace': 4, 'Fire Sprite': 4, 'Samurai': 3, 'Ent': 2, 'Reviver': 5,
    'Foot Soldier': 1, 'Medic': 1, 'Lightning Ninja': 3, 'Eagle Warrior': 3, 'Unstable Bomb Expert': 2,
    'Cobalt Knight': 2, 'Corrupt Commander': 4, 'Ranged Expert': 4, 'Melee Expert': 6, 'Joker': 3,
    'Unskilled Warrior': 1, 'The Manipulator': 3, 'Dragon Tamer': 5, 'Frost Brute': 2, 'Stone Monster': 3,
    'Tactical Alchemist': 2, 'Guardian': 5, 'Attack Wagon': 2, 'Centurion': 4, 'Field Marshall': 5, 'Phoenix': 4,
    'Kings Knight': 5, "General's Guard": 3, 'Bounty Hunter': 14,
}
# Rarity by power percentile among non-General cards: bottom 30% Common, 30% Uncommon, 20% Rare, 13% Epic, 7% Legendary
RARITY_SPLITS = [(0.30, 'common'), (0.60, 'uncommon'), (0.80, 'rare'), (0.93, 'epic'), (1.01, 'legendary')]
STARTER_COUNT = 20


def assign_rarity(cards):
    pool = [c for c in cards if c['key'] != 'general']
    for c in pool:
        c['power'] = (c['life'] or 0) + ABILITY_WEIGHT.get(c['name'], 3)
    ranked = sorted(pool, key=lambda c: (c['power'], c['name']))
    for i, c in enumerate(ranked):
        f = i / len(ranked)
        c['rarity'] = next(r for lim, r in RARITY_SPLITS if f < lim)
    for c in cards:
        if c['key'] == 'general':
            c['rarity'], c['power'], c['starter'] = 'legendary', 99, True
    ready = [c for c in sorted(pool, key=lambda c: (c['power'], c['name'])) if c['ready']]
    starters = set(c['key'] for c in ready[:STARTER_COUNT])
    for c in pool:
        c['starter'] = c['key'] in starters


def fix_name(raw):
    name = re.sub(r'\s+', ' ', raw.strip())
    for bad, good in NAME_FIXES.items():
        name = name.replace(bad, good)
    return name


def fix_text(t):
    t = re.sub(r'\s+', ' ', (t or '').strip()).replace('�', "'")
    for bad, good in NAME_FIXES.items():
        t = t.replace(bad, good)
    return t


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def find_art(key):
    # Custom override art in images/cards/<slug>.(png|jpg|webp); None -> sprite / SVG fallback
    for ext in ('png', 'jpg', 'webp'):
        if os.path.exists(os.path.join(ROOT, 'images', 'cards', key + '.' + ext)):
            return 'images/cards/%s.%s' % (key, ext)
    return None


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Sheet2']
    cards = []
    for row in list(ws.iter_rows(values_only=True))[1:]:
        cells = [('' if c is None else str(c)) for c in row]
        if not cells[0].strip():
            continue
        raw = cells[0]
        name = fix_name(raw)
        life_s, code, text = cells[1].strip(), cells[2].strip(), cells[3]
        if name == 'Reviver' and not life_s:  # row is shifted one column right
            life_s, code, text = cells[3].strip(), cells[4].strip(), cells[5]
        try:
            life = int(life_s)
        except ValueError:
            life = None
        pattern = PATTERNS.get(code.lower(), 'special')
        ready = name in READY and (life is not None or name in READY_SPECIAL_LIFE)
        if ready:
            note = ''
        elif life is None:
            note = 'Special Life value (%s) - later session' % life_s
        else:
            note = LATER.get(name, 'Ability not implemented yet')
        cards.append({
            'key': slug(name), 'name': name, 'rawName': raw, 'life': life, 'lifeRaw': life_s,
            'code': code, 'pattern': pattern, 'text': fix_text(text), 'ready': ready, 'note': note,
            'art': find_art(slug(name)),
        })

    assign_rarity(cards)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// GENERATED by tools/build_cards.py from Cards-Excell.xlsx - do not edit by hand.\n')
        f.write('var KV_CARDS = ' + json.dumps(cards, indent=1, ensure_ascii=False) + ';\n')
        f.write("if (typeof module !== 'undefined') module.exports = KV_CARDS;\n")

    with open(IMG_README, 'w', encoding='utf-8') as f:
        f.write('# Card art overrides\n\n')
        f.write('Drop a picture here named exactly as below (.png, .jpg or .webp) and it replaces the sprite/SVG.\n')
        f.write('Recommended size: **400x560** (5:7 portrait).\n\n')
        for c in cards:
            f.write('- `%s.png` - %s\n' % (c['key'], c['name']))

    smap_path = os.path.join(ROOT, 'images', 'sprites', 'sprite-map.json')
    if os.path.exists(smap_path):
        smap = json.load(open(smap_path, encoding='utf-8'))
        with open(os.path.join(ROOT, 'js', 'sprite-map.js'), 'w', encoding='utf-8') as f:
            f.write('// Fallback copy of images/sprites/sprite-map.json for file:// use. Regenerate with tools/build_cards.py\n')
            f.write('var KV_SPRITE_MAP = ' + json.dumps(smap, indent=1) + ';\n')

    ready = [c['name'] for c in cards if c['ready']]
    print('%d cards, %d ready' % (len(cards), len(ready)))
    from collections import Counter
    print('rarity:', dict(Counter(c['rarity'] for c in cards if c['ready'])))
    print('starters:', ', '.join(c['name'] for c in cards if c.get('starter') and c['key'] != 'general'))
    for c in cards:
        print('%-3s %-30s life=%-4s %-8s %s' % ('OK' if c['ready'] else '--', c['name'], c['life'], c['pattern'], c['text'][:60]))


if __name__ == '__main__':
    main()
