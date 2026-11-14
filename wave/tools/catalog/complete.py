#!/usr/bin/env python3
"""Adopt the already extracted October client data; never execute/re-extract Wasm.

The behavior choices live beside the catalog, separately from numerical evidence.
Running this tool is idempotent and preserves existing reconstruction settings.
"""
import copy
import json
from pathlib import Path
from generate import client_adoptions

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data/catalogs/20221030'

MOB_KINDS = ('rock cactus ladybug bee baby_ant worker_ant soldier_ant queen_ant '
             'ant_hole beetle hornet centipede centipede_segment evil_centipede '
             'evil_centipede_segment desert_centipede desert_centipede_segment '
             'square dark_ladybug shiny_ladybug spider scorpion fire_ant '
             'fire_ant_burrow sandstorm bubble acid_bubble shell starfish crab '
             'jellyfish digger sponge leech leech_segment').split()

EFFECTS = {'basic': 'contact', 'light': 'contact', 'rock': 'contact', 'square': 'contact',
           'stinger': 'contact', 'peas': 'projectile', 'grapes': 'poison_projectile',
           'missile': 'projectile', 'egg': 'summon'}
MECHANICS = dict(attack_distance=26, defend_distance=8, shield=0, reflection=0,
                 damage_ratio=0, damage_limit=0, heal_ratio=0, knockback=0,
                 chain_damage=0, bounces=0, vision_multiplier=1, pickup_multiplier=1,
                 body_damage=0, sponge_seconds=0, speed_multiplier=1, size_multiplier=1,
                 hidden=False)
FIELD_MAP = {'Heal': 'heal', 'Flower Health': 'healthBonus', 'Duration': 'durationSeconds',
             'Rotation speed': 'rotationBonus', 'Mob Heal': 'friendlyMobHeal'}


def main():
    pack = json.loads((DATA / 'catalog.json').read_text())
    observed = json.loads((DATA / 'client-tooltips.json').read_text())
    review = {e['id']: e for e in json.loads((DATA / 'behavior-review.json').read_text())['entries']}
    existing = {(r['kind'], r['rarity']): r for r in pack['petals']}
    mob_existing = {(r['kind'], r['rarity']): r for r in pack['mobs']}
    template = copy.deepcopy(pack['petals'][0])
    pack['version'] = '20221030-w3.3'
    pack['petals'] = []
    for petal in observed['petals']:
        kind = petal['name'].lower().replace(' ', '_')
        for v in petal['variants']:
            row = copy.deepcopy(existing.get((kind, v['rarity']), template))
            fields = {f['label']: f.get('value') for f in v['fields']}
            body = v.get('body')
            row.update(kind=kind, rarity=v['rarity'], clientId=petal['id'], name=petal['name'],
                       effect=EFFECTS.get(kind, kind), reloadSeconds=v['reloadSeconds'],
                       activationSeconds=v['activationSeconds'],
                       particles=4 if kind in ('peas', 'grapes') else v['orbitCount'])
            if (kind, v['rarity']) not in existing:
                for key in ['activationSeconds', 'heal', 'passiveHealPerSecond', 'friendlyMobHeal',
                            'rotationBonus', 'projectileSpeed', 'range', 'durationSeconds',
                            'healthBonus', 'areaRadius']:
                    row[key] = v['activationSeconds'] if key == 'activationSeconds' else 0
                row['slowMultiplier'] = 1
                row['body'] = dict(radius=max(.2, body['radius'] / 5) if body else .2,
                                   health=body['health'] if body else 1, speed_per_second=0,
                                   contact_damage=body['damage'] if body else 0,
                                   contact_heal=0, poison_per_tick=0, poison_ticks=0)
            for label, key in FIELD_MAP.items():
                if fields.get(label) is not None:
                    row[key] = fields[label]
            if kind in ('leaf', 'yucca', 'starfish'):
                row['passiveHealPerSecond'] = fields['Heal']
                row['heal'] = 0
            if kind in ('iris', 'pincer'):
                duration = fields['Poison'] / (45 if v['rarity'] == 5 else 15) if kind == 'iris' else fields['Duration']
                row['body']['poison_ticks'] = max(1, int(duration / .025 + .999999))
                row['body']['poison_per_tick'] = fields['Poison'] / row['body']['poison_ticks']
            if kind in ('pincer', 'honey'):
                row['slowMultiplier'] = .2 if kind == 'pincer' else .8
            if kind in ('pollen', 'dandelion', 'pearl'):
                row['projectileSpeed'] = 0 if kind == 'pollen' else 100
                row['range'] = 100 if kind == 'pollen' else 150
            if kind in ('rose', 'dahlia', 'shell'):
                row['range'] = row['range'] or 40
            if kind == 'uranium':
                row['areaRadius'] = 50
            if kind == 'egg':
                row['durationSeconds'] = 0  # A hatchling survives until defeated.
            if kind == 'stick':
                row['durationSeconds'] = 10
                row['areaRadius'] = 45
            row.pop('knockback', None)
            m = copy.deepcopy(MECHANICS)
            if body:
                m['attack_distance'] = max(0, body['attackDistance'] / 5) if body['attackDistance'] >= 0 else 26
                m['defend_distance'] = max(0, body['defendDistance'] / 5) if body['defendDistance'] >= 0 else 8
            for label, key, scale in [('Shield', 'shield', 1), ('Damage Reflection', 'reflection', .01),
                                      ('% Damage', 'damage_ratio', .01), ('Limit', 'damage_limit', 1),
                                      ('Damage Healed', 'heal_ratio', .01), ('Knockback', 'knockback', .2),
                                      ('Bounces', 'bounces', 1), ('Body Damage', 'body_damage', 1),
                                      ('Period', 'sponge_seconds', 1)]:
                if fields.get(label) is not None:
                    m[key] = fields[label] * scale
            m['bounces'] = int(m['bounces'])
            if kind == 'lightning':
                m['chain_damage'] = fields['Damage']
            if kind == 'antennae':
                m['vision_multiplier'] = 1 + fields['Extra vision'] / 100
            if kind == 'magnet':
                m['pickup_multiplier'] = 1 + fields['Pickup range'] / 100
            if kind == 'soil':
                m.update(speed_multiplier=.9, size_multiplier=1.15)
            m['hidden'] = kind in ('antennae', 'third_eye', 'cutter')
            row['mechanics'] = m
            row['clientValues'] = dict(offset12=body['damage'], offset16=body['health']) if body else None
            row['evidenceKey'] = 'petal.' + kind if 'petal.' + kind in {e['id'] for e in pack['evidence']} else 'behavior.full'
            provenance = row['provenance']
            provenance['clientTooltip'] = dict(source='client.tooltips', id=petal['id'], rarity=v['rarity'])
            adopted = client_adoptions('petals', row, v)
            provenance['adoptedFields'] = list(adopted)
            provenance['candidateRanges'] = {key: ([row[key], row[key]] if key in adopted or not row[key]
                else [row[key] * .5, min(1, row[key] * 2) if key == 'slowMultiplier' else row[key] * 2]) for key in
                ['reloadSeconds', 'activationSeconds', 'heal', 'passiveHealPerSecond',
                 'friendlyMobHeal', 'rotationBonus', 'projectileSpeed', 'range', 'durationSeconds',
                 'slowMultiplier', 'healthBonus', 'areaRadius']}
            provenance['bodyCandidateRanges'] = {key: ([value, value] if key in ('health', 'contact_damage') or not value
                else [value * .5, value * 2]) for key, value in row['body'].items()}
            provenance['behaviorKey'] = 'petal.' + kind
            issue = review['petal.' + kind]['manualReview']
            provenance['unknowns'] = [issue] if issue else []
            pack['petals'].append(row)
    pack['mobs'] = []
    stationary = {'rock', 'cactus', 'ant_hole', 'fire_ant_burrow', 'sponge'}
    passive = {'ladybug', 'baby_ant', 'centipede', 'desert_centipede', 'square', 'bubble', 'shell'}
    neutral = {'bee', 'worker_ant', 'dark_ladybug', 'shiny_ladybug', 'crab'}
    special = {'hornet': 'ranged', 'ant_hole': 'spawner', 'fire_ant_burrow': 'spawner',
               'sandstorm': 'sandstorm', 'starfish': 'starfish', 'jellyfish': 'jellyfish',
               'digger': 'digger', 'leech': 'leech'}
    parents = {13: 12, 15: 14, 17: 16, 35: 34}
    for mob in observed['mobs']:
        kind = MOB_KINDS[mob['id'] - 1]
        for v in mob['variants']:
            row = copy.deepcopy(mob_existing.get((kind, v['rarity']), {}))
            fields = {f['label']: f for f in v['fields']}
            health = fields.get('Health', {'value': v['baseHealth'] * v['healthMultiplier']})
            body = row.get('body', dict(radius=6, health=1, speed_per_second=30,
                                       contact_damage=1, contact_heal=0, poison_per_tick=0,
                                       poison_ticks=0))
            body.update(health=health.get('range', [health['value']])[0],
                        contact_damage=fields.get('Damage', {'value': v['baseDamage'] * v['damageMultiplier']})['value'])
            if kind in stationary:
                body['speed_per_second'] = 0
            if kind == 'desert_centipede':
                body['speed_per_second'] = 55
            # Hornet bullets, not the hornet body, carry the ranged attack.
            if kind == 'hornet':
                body.update(poison_per_tick=0, poison_ticks=0)
            body.update(poison_ticks=0, poison_per_tick=0)
            if kind == 'scorpion':
                body['poison_ticks'] = 120
                body['poison_per_tick'] = fields.get('Poison', {'value': body['contact_damage']})['value'] / 120
            ai = special.get(kind, 'segment' if mob['id'] in parents else
                             'stationary' if kind in stationary else 'passive' if kind in passive else
                             'neutral' if kind in neutral else 'chase')
            row.update(kind=kind, rarity=v['rarity'], clientId=mob['id'],
                       segmentClientId=mob['id'] + 1 if mob['id'] in (12, 14, 16, 34) else 0,
                       body=body, summon=kind in ('beetle', 'baby_ant', 'worker_ant', 'soldier_ant'),
                       evidenceKey='behavior.full', xp=2 ** v['rarity'], ai=ai,
                       segments=5 if mob['id'] in (12, 14, 16, 34) else 0,
                       parentClientId=parents.get(mob['id'], 0),
                       reviewRequired=review['mob.' + kind]['status'] == 'manual-review')
            for label, key in [('Missile health', 'missileHealth'), ('Missile damage', 'missileDamage'),
                               ('Lightning', 'lightningDamage'), ('Bounces', 'lightningBounces'),
                               ('Lifesteal', 'lifesteal')]:
                row[key] = fields.get(label, {'value': 0})['value']
            row['provenance'] = dict(server='client-tooltip-adoption-with-reconstruction',
                                    clientTooltip=dict(source='client.tooltips', id=mob['id'], rarity=v['rarity']),
                                    adoptedFields=list(client_adoptions('mobs', row, v)),
                                    behaviorKey='mob.' + kind,
                                    unknowns=[review['mob.' + kind]['manualReview']] if review['mob.' + kind]['manualReview'] else [])
            pack['mobs'].append(row)
    if not any(e['id'] == 'behavior.full' for e in pack['evidence']):
        pack['evidence'].append(dict(id='behavior.full', sources=['client.tooltips', 'wiki.hornet',
                                    'wiki.spider', 'wiki.ladybug'], confidence='explicit-reconstruction',
                                    notes='Original descriptions plus dated wiki and world PvP source reuse. '
                                          'See behavior-review.json for per-kind evidence and manual verification.'))
    petal_kinds = {r['clientId']: r['kind'] for r in pack['petals']}
    pack['drops']['entries'] = [dict(mob=MOB_KINDS[m['id'] - 1], mobRarity=v['rarity'],
                                    petal=petal_kinds[d['petalId']], rarity=d['rarity'], probability=d['probability'])
                               for m in observed['mobs'] for v in m['variants']
                               for d in v['drops']['candidates'] if d['probability'] is not None and d['probability'] > 0]
    pack['drops']['note'] = ('Exact complete client probabilities, including hidden nonzero entries. '
                            'Independent roll per petal kind; rarities of the same kind are exclusive. '
                            'Team eligibility and this roll policy are explicit reconstruction.')
    (DATA / 'catalog.json').write_text(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
