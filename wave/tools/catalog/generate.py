#!/usr/bin/env python3
"""Validate the dated source pack and deterministically emit the header-only catalog.

The default check uses only hash-locked evidence inside this source package.
Use --verify-evidence --evidence-root PATH [--snapshot PATH] for full upstream
byte verification. No network or third-party dependencies are used.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

SOURCE_DIR = Path(__file__).resolve().parents[2]
PACK = SOURCE_DIR / 'data/catalogs/20221030/catalog.json'
HEADER = SOURCE_DIR / 'server/catalog/generated.hpp'
EVIDENCE_INPUTS = PACK.with_name('evidence-inputs.json')
EVIDENCE_SHA256 = '342e4fbc31ac2da7cfaa902c544c4f334955d50b0fdf2644ea1de4cda624576a'
KINDS = tuple(('basic light rock square rose stinger iris wing missile grapes cactus '
               'faster bubble pollen dandelion egg antennae heavy yin_yang web honey '
               'leaf salt rice corn sand pincer yucca magnet yggdrasil starfish pearl '
               'lightning jelly claw shell cutter dahlia uranium sponge soil fangs '
               'third_eye peas stick').split())
MOBS = tuple(('rock cactus ladybug bee baby_ant worker_ant soldier_ant queen_ant '
              'ant_hole beetle hornet centipede centipede_segment evil_centipede '
              'evil_centipede_segment desert_centipede desert_centipede_segment '
              'square dark_ladybug shiny_ladybug spider scorpion fire_ant fire_ant_burrow '
              'sandstorm bubble acid_bubble shell starfish crab jellyfish digger sponge '
              'leech leech_segment').split())
MECHANICS = ('attack_distance defend_distance shield reflection damage_ratio damage_limit '
             'heal_ratio knockback chain_damage bounces vision_multiplier pickup_multiplier '
             'body_damage sponge_seconds speed_multiplier size_multiplier hidden').split()
BODY = ('radius', 'health', 'speed_per_second', 'contact_damage', 'contact_heal',
        'poison_per_tick', 'poison_ticks', 'contact_cooldown')
FIELDS = ('activationSeconds', 'heal', 'passiveHealPerSecond', 'friendlyMobHeal',
          'rotationBonus', 'projectileSpeed', 'range', 'durationSeconds',
          'slowMultiplier', 'healthBonus', 'areaRadius')
EFFECTS = set(KINDS) | {'contact', 'projectile', 'poison_projectile', 'summon'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique(rows, field, label):
    values = [r[field] for r in rows]
    require(len(values) == len(set(values)), f'duplicate {label}')
    return set(values)


def walk(value, path='catalog'):
    if isinstance(value, dict):
        for key, child in value.items():
            walk(child, f'{path}.{key}')
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, f'{path}[{index}]')
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        require(math.isfinite(value), f'non-finite value: {path}')


def checked_bytes(path, expected_hash, label):
    require(path.is_file(), f'missing {label}: {path}')
    raw = path.read_bytes()
    require(hashlib.sha256(raw).hexdigest() == expected_hash, f'{label} hash mismatch')
    return raw


def bundled_evidence():
    inputs = json.loads(checked_bytes(EVIDENCE_INPUTS, EVIDENCE_SHA256, 'bundled evidence'))
    require(inputs['schemaVersion'] == 1, 'unsupported bundled evidence version')
    return inputs


def tooltip_evidence(inputs):
    selection = inputs['tooltipEvidence']
    path = PACK.with_name('client-tooltips.json')
    result = json.loads(checked_bytes(path, selection['sha256'], 'client tooltip evidence'))
    walk(result, 'tooltips')
    require(result['buildHash'] == inputs['reference']['buildHash'], 'tooltip client identity drift')
    for section, count in [('petals', 45), ('mobs', 35)]:
        require([r['id'] for r in result[section]] == list(range(1, count + 1)),
                f'incomplete original {section} tooltip coverage')
        for row in result[section]:
            require([v['rarity'] for v in row['variants']] == list(range(6)),
                    'incomplete tooltip rarity coverage')
            for variant in row['variants']:
                unique(variant['fields'], 'label', 'tooltip field')
                if section == 'mobs':
                    candidates = variant['drops']['candidates']
                    keys = [(d['petalId'], d['rarity']) for d in candidates]
                    expected = {(d['petalId'], r) for d in row['loot'] for r in range(6)}
                    require(len(keys) == len(set(keys)) and set(keys) == expected,
                            'incomplete mob drop candidate coverage')
                    require(all(d['petalId'] in range(1, 46) for d in candidates),
                            'unknown drop tooltip petal')
                    require(all(d['probability'] is None or 0 <= d['probability'] <= 1
                                for d in candidates), 'invalid tooltip drop probability')
                    shown = [(d['petalId'], d['rarity'], d['display'])
                             for d in candidates if d['displayed']]
                    panel = [(d['petalId'], d['rarity'], d['display'])
                             for d in variant['drops']['panel']]
                    require(shown == panel, 'drop tooltip panel/candidate mismatch')
    return result


def behavior_evidence(inputs):
    files = {}
    for key, record in inputs['behaviorEvidence'].items():
        require(record['file'] == Path(record['file']).name, 'invalid behavior evidence path')
        files[key] = json.loads(checked_bytes(PACK.with_name(record['file']), record['sha256'], key))
    wiki, review = files['behavior.wiki'], files['behavior.review']
    require(wiki['cutoffUtc'] == review['cutoffUtc'] == '2022-10-30T21:00:58Z',
            'behavior cutoff drift')
    revisions = {}
    for title, record in wiki['pages'].items():
        for page in record.get('response', {}).get('query', {}).get('pages', {}).values():
            for revision in page.get('revisions', []):
                require(revision['timestamp'] <= wiki['cutoffUtc'], 'post-cutoff behavior revision')
                revisions[title, revision['revid']] = revision['timestamp']
    entries = review['entries']
    expected = {'petal.' + k for k in KINDS} | {'mob.' + k for k in MOBS}
    require(unique(entries, 'id', 'behavior rule') == expected, 'incomplete behavior coverage')
    for entry in entries:
        require(entry['behavior'] and entry['sources'], 'missing behavior provenance')
        require(entry['status'] in {'manual-review', 'sourced-behavior'} and
                bool(entry['manualReview']) == (entry['status'] == 'manual-review'),
                'missing manual review marker')
        for source in entry['sources']:
            require(source['type'] in {'wiki', 'repository', 'client-tooltip'}, 'unknown behavior source')
            if source['type'] == 'wiki':
                require(revisions.get((source['title'], source['revision'])) == source['timestamp'],
                        'unarchived behavior revision')
    return {e['id']: e for e in entries}


def client_adoptions(section, row, observed):
    """Explicit conversion from observed display data to current simulation units.

    Multi-projectile HP division and ranged mob HP selection are adoption policies,
    not claims that a client tooltip establishes the historical server algorithm.
    """
    fields = {f['label']: f for f in observed['fields']}
    if section == 'mobs':
        health = fields.get('Health', {'value': observed['baseHealth'] * observed['healthMultiplier']})
        return {'body.health': health.get('range', [health['value']])[0],
                'body.contact_damage': fields.get('Damage', {'value': observed['baseDamage'] * observed['damageMultiplier']})['value'],
                **{key: fields.get(label, {'value': 0})['value'] for label, key in
                   [('Missile health', 'missileHealth'), ('Missile damage', 'missileDamage'),
                    ('Lightning', 'lightningDamage'), ('Bounces', 'lightningBounces'), ('Lifesteal', 'lifesteal')]}}
    client_body = observed.get('body')
    adopted = {
        'body.contact_damage': client_body['damage'] if client_body else 0,
        'body.health': client_body['health'] / (4 if row['kind'] in ('peas', 'grapes') else 1) if client_body else 1,
        'reloadSeconds': observed['reloadSeconds'],
        'activationSeconds': observed['activationSeconds'],
        'particles': 4 if row['kind'] in ('peas', 'grapes') else observed['orbitCount'],
    }
    for kind, label, target in [
        ('rose', 'Heal', 'heal'), ('leaf', 'Heal', 'passiveHealPerSecond'),
        ('leaf', 'Mob Heal', 'friendlyMobHeal'), ('faster', 'Rotation speed', 'rotationBonus'),
        ('cactus', 'Flower Health', 'healthBonus'), ('web', 'Duration', 'durationSeconds'),
        ('honey', 'Duration', 'durationSeconds'),
        ('dandelion', 'Duration', 'durationSeconds'), ('pincer', 'Duration', 'durationSeconds'),
        ('yucca', 'Heal', 'passiveHealPerSecond'), ('starfish', 'Heal', 'passiveHealPerSecond'),
        ('dahlia', 'Heal', 'heal'), ('soil', 'Flower Health', 'healthBonus'),
    ]:
        if row['kind'] == kind:
            adopted[target] = fields[label]['value']
    if row['kind'] == 'web':
        adopted['areaRadius'] = fields['Radius']['value'] / 5
    if row['kind'] == 'grapes':
        adopted['body.poison_per_tick'] = fields['Poison']['value'] / row['body']['poison_ticks']
    if row['kind'] == 'egg':
        contents = fields['Contents']['display']
        name, rarity = contents.rsplit(' (', 1)
        adopted['summon'] = {
            'mob': name.lower().replace(' ', '_'),
            'rarity': ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'].index(rarity[:-1]),
        }
    mechanics = {'Shield': ('shield', 1), 'Damage Reflection': ('reflection', .01),
                 '% Damage': ('damage_ratio', .01), 'Limit': ('damage_limit', 1),
                 'Damage Healed': ('heal_ratio', .01), 'Knockback': ('knockback', .2),
                 'Bounces': ('bounces', 1), 'Body Damage': ('body_damage', 1),
                 'Period': ('sponge_seconds', 1)}
    for label, (key, scale) in mechanics.items():
        if label in fields:
            adopted['mechanics.' + key] = fields[label]['value'] * scale
    if row['kind'] == 'lightning':
        adopted['mechanics.chain_damage'] = fields['Damage']['value']
    for kind, label, key in [('antennae', 'Extra vision', 'vision_multiplier'),
                              ('magnet', 'Pickup range', 'pickup_multiplier')]:
        if row['kind'] == kind:
            adopted['mechanics.' + key] = 1 + fields[label]['value'] / 100
    return adopted


def nested_value(row, key):
    for part in key.split('.'):
        row = row[part]
    return row


def validate(pack, inputs=None):
    if inputs is None:
        inputs = bundled_evidence()
    tooltips = tooltip_evidence(inputs)
    behaviors = behavior_evidence(inputs)
    walk(pack)
    require(pack['schemaVersion'] == 1 and pack['version'] == '20221030-w3.3', 'unlocked version')
    require(pack['cutoffUtc'] == '2022-10-30T21:00:58Z', 'unlocked historical cutoff')
    reference = inputs['reference']
    require(pack['clientBuildHash'] == reference['buildHash'], 'client build hash mismatch')
    expected_wasm = next(x['sha256'] for x in reference['snapshot'] if x['file'] == 'client.wasm')
    require(pack['clientWasmSha256'] == expected_wasm, 'client wasm hash mismatch')
    sources = unique(pack['sources'], 'id', 'source id')
    require(pack['sources'] == inputs['sources'], 'source metadata/hash differs from locked evidence')
    for source in pack['sources']:
        if 'timestamp' in source:
            require(source['timestamp'] <= pack['cutoffUtc'], 'post-cutoff wiki revision')
    evidence = unique(pack['evidence'], 'id', 'evidence id')
    for claim in pack['evidence']:
        require(claim['sources'] and set(claim['sources']) <= sources, 'unknown evidence source')
    require(pack['rarities'] == [{'id': i, 'name': n} for i, n in enumerate(
        ['Common', 'Unusual', 'Rare', 'Epic', 'Legendary', 'Mythic'])], 'rarity ID/name mismatch')
    for kind in ['petals', 'mobs']:
        unique(pack['registries'][kind], 'id', f'{kind} client id')
        require(pack['registries'][kind] == inputs['registries'][kind],
                f'{kind} registry differs from original client')
    for section, kinds in [('petals', KINDS), ('mobs', MOBS)]:
        rows = pack[section]
        keys = [(r['kind'], r['rarity']) for r in rows]
        require(len(set(keys)) == len(keys), f'duplicate {section} kind/rarity')
        require(set(keys) == {(k, r) for k in kinds for r in range(6)}, f'incomplete {section} mapping')
        mapped = [(r['clientId'], r['rarity']) for r in rows]
        require(len(mapped) == len(set(mapped)), f'duplicate {section} client id/rarity')
        registry = {r['id']: r for r in pack['registries'][section]}
        ids_by_kind = {}
        for row in rows:
            behavior = behaviors[('petal.' if section == 'petals' else 'mob.') + row['kind']]
            require(row['provenance']['behaviorKey'] == behavior['id'] and
                    row['provenance']['unknowns'] == ([behavior['manualReview']] if behavior['manualReview'] else []),
                    'behavior provenance/review drift')
            require(type(row['rarity']) is int and 0 <= row['rarity'] < 6, 'invalid rarity')
            require(row['clientId'] in registry, 'unknown client reference')
            require(row['evidenceKey'] in evidence, 'unregistered evidenceKey')
            require(row['provenance']['server'] == 'client-tooltip-adoption-with-reconstruction',
                    'unsubstantiated authoritative claim')
            observed = tooltips[section][row['clientId'] - 1]['variants'][row['rarity']]
            require(row['provenance']['adoptedFields'] == list(client_adoptions(section, row, observed)),
                    'client adoption field list drift')
            for key, value in client_adoptions(section, row, observed).items():
                require(nested_value(row, key) == value, f'client tooltip adoption drift: {row["kind"]}.{key}')
            ids_by_kind.setdefault(row['kind'], row['clientId'])
            require(ids_by_kind[row['kind']] == row['clientId'], 'unstable kind/client mapping')
            body = row['body']
            require(set(body) == set(BODY), 'missing or unknown body field')
            require(all(type(v) in (int, float) and v >= 0 for v in body.values()), 'negative body value')
            require(body['radius'] > 0 and body['health'] > 0 and body['contact_cooldown'] > 0,
                    'invalid body dimensions/cooldown')
            for k in ['poison_ticks', 'contact_cooldown']:
                require(type(body[k]) is int, 'fractional tick count')
            require((body['poison_ticks'] > 0) == (body['poison_per_tick'] > 0), 'incomplete poison rule')
            if section == 'petals':
                require(row['name'] == registry[row['clientId']]['name'], 'client petal name mismatch')
                require(row['kind'] == row['name'].lower().replace(' ', '_'), 'kind/client identity mismatch')
                require(row['effect'] in EFFECTS, 'unknown effect')
                require(type(row['particles']) is int and 1 <= row['particles'] <= 16, 'invalid particle count')
                require(row['reloadSeconds'] >= 0 and all(row[k] >= 0 for k in FIELDS), 'invalid effect value')
                require(set(row['mechanics']) == set(MECHANICS), 'incomplete mechanics')
                require(all(type(v) in (int, float) and v >= 0 for k, v in row['mechanics'].items()
                            if k != 'hidden') and type(row['mechanics']['hidden']) is bool,
                        'invalid petal mechanics')
                require(type(row['mechanics']['bounces']) is int, 'invalid bounce count')
                require(all(row['mechanics'][k] > 0 for k in
                            ['vision_multiplier', 'pickup_multiplier', 'speed_multiplier', 'size_multiplier']),
                        'invalid passive multiplier')
                require(row['mechanics']['damage_ratio'] <= 1, 'invalid percent damage')
                require(0 <= row['slowMultiplier'] <= 1, 'slow probability/multiplier out of range')
                effect_ranges = row['provenance']['candidateRanges']
                require(set(effect_ranges) == set(FIELDS) | {'reloadSeconds'},
                        'incomplete effect candidate bounds')
                for field, bounds in effect_ranges.items():
                    require(len(bounds) == 2 and 0 <= bounds[0] <= row[field] <= bounds[1],
                            'reconstruction outside candidate range')
                body_ranges = row['provenance']['bodyCandidateRanges']
                require(set(body_ranges) == set(BODY), 'incomplete body candidate bounds')
                for field, bounds in body_ranges.items():
                    require(len(bounds) == 2 and 0 <= bounds[0] <= body[field] <= bounds[1],
                            'body reconstruction outside candidate range')
                if observed.get('body'):
                    require(row['clientValues']['offset12'] == observed['body']['damage'] and
                            row['clientValues']['offset16'] == observed['body']['health'], 'raw client value drift')
                else:
                    require(row['clientValues'] is None and row['mechanics']['hidden'],
                            'hidden passive must not invent client body values')
                if row['effect'] == 'summon':
                    require(row['summon']['mob'] in MOBS and 0 <= row['summon']['rarity'] < 6,
                            'invalid original Egg contents')
            else:
                require(type(row['xp']) is int and row['xp'] >= 0, 'invalid mob XP')
                require(row['segmentClientId'] == 0 or row['segmentClientId'] in registry,
                        'unknown segment reference')
                require(row['ai'] in {'stationary', 'passive', 'neutral', 'chase', 'ranged', 'spawner',
                                     'sandstorm', 'starfish', 'jellyfish', 'digger', 'leech', 'segment'},
                        'unknown mob AI')
                require(type(row['reviewRequired']) is bool and type(row['segments']) is int and
                        0 <= row['segments'] <= 16, 'invalid mob behavior metadata')
                require(row['reviewRequired'] == (behavior['status'] == 'manual-review'), 'mob review marker drift')
                parent = row['parentClientId']
                require(parent == 0 or parent in registry, 'unknown segment parent')
                require(type(row['lightningBounces']) is int and row['lightningBounces'] >= 0,
                        'invalid mob bounce count')
    for section in ['spawn', 'encoding', 'ordering', 'craft', 'levels', 'drops']:
        require(pack[section]['evidenceKey'] in evidence, 'unregistered table evidenceKey')
    rule_ids = {r['id'] for r in inputs['rules']}
    require(pack['spawn']['sourceRule'] in rule_ids, 'unknown spawn rule reference')
    require(pack['craft']['inputs'] == 5 and pack['craft']['maximumRarity'] == 5, 'invalid craft bounds')
    display = pack['craft']['clientEvidence']
    require(display['evidenceKey'] in evidence, 'unregistered craft display evidence')
    require(display == {k: v for k, v in inputs['craftDisplay'].items() if k != 'bytesHex'},
            'original craft display locator drift')
    display_bytes = bytes.fromhex(inputs['craftDisplay']['bytesHex'])
    require(len(display_bytes) == 20, 'incomplete original craft display bytes')
    require(pack['craft']['clientPercent'] == list(struct.unpack('<5I', display_bytes)),
            'original craft display table drift')
    probabilities = [pack['spawn']['specialChance']] + pack['craft']['successProbabilities']
    require(len(pack['craft']['successProbabilities']) == 5, 'incomplete craft probabilities')
    require(pack['craft']['failureLossRange'] == [1, 4], 'invalid failure loss range')
    weights = pack['craft']['failureLossWeights']
    require(len(weights) == 4 and all(type(n) is int and n >= 0 for n in weights) and
            sum(weights) > 0, 'invalid failure loss weights')
    require(len(pack['craft']['probabilityCandidateRanges']) == 5, 'incomplete craft candidate bounds')
    for r, bounds in enumerate(pack['craft']['probabilityCandidateRanges']):
        require(0 <= bounds[0] <= pack['craft']['successProbabilities'][r] <= bounds[1] <= 1,
                'craft probability outside evidence bounds')
    require(pack['craft']['successProbabilities'][4] == .03, 'primary Mythic craft rate drift')
    totals = {}
    drop_keys = set()
    require(pack['drops']['evidenceKey'] == 'drops.client-display' and
            pack['drops']['allocationEvidenceKey'] == 'economy.reconstruction',
            'drop probability/allocation evidence drift')
    for drop in pack['drops']['entries']:
        require(drop['mob'] in MOBS and drop['petal'] in KINDS and type(drop['rarity']) is int and
                0 <= drop['rarity'] < 6 and type(drop['mobRarity']) is int and
                0 <= drop['mobRarity'] < 6, 'unknown drop reference')
        mob = next(r for r in pack['mobs'] if (r['kind'], r['rarity']) ==
                   (drop['mob'], drop['mobRarity']))
        petal = next(r for r in pack['petals'] if (r['kind'], r['rarity']) ==
                     (drop['petal'], drop['rarity']))
        observed = tooltips['mobs'][mob['clientId'] - 1]['variants'][drop['mobRarity']]
        matches = [d for d in observed['drops']['candidates']
                   if (d['petalId'], d['rarity']) == (petal['clientId'], drop['rarity'])]
        require(len(matches) == 1 and matches[0]['probability'] == drop['probability'],
                'client drop probability adoption drift')
        probabilities.append(drop['probability'])
        key = (drop['mob'], drop['mobRarity'], drop['petal'], drop['rarity'])
        require(key not in drop_keys, 'duplicate drop rule')
        drop_keys.add(key)
        population = (drop['mob'], drop['mobRarity'], drop['petal'])
        totals[population] = totals.get(population, 0) + drop['probability']
    require(all(type(p) in (int, float) and 0 <= p <= 1 for p in probabilities), 'probability out of range')
    require(all(total <= 1 + 1e-12 for total in totals.values()), 'petal rarity probability total exceeds one')
    expected_drops = {(MOBS[m['id'] - 1], v['rarity'], KINDS[d['petalId'] - 1], d['rarity'])
                      for m in tooltips['mobs'] for v in m['variants']
                      for d in v['drops']['candidates'] if d['probability'] is not None and d['probability'] > 0}
    require(drop_keys == expected_drops, 'incomplete full drop coverage')
    thresholds = pack['levels']['xpThresholds']
    require(thresholds and thresholds[0] == 0 and all(type(n) is int for n in thresholds) and
            all(a < b for a, b in zip(thresholds, thresholds[1:])), 'invalid XP thresholds')
    levels = pack['levels']
    require(levels['maximumLevel'] == 255 and len(thresholds) == 256,
            'missing client level cap or next-level sentinel')
    require(levels['curve'] == '100*(level-1)^2' and
            thresholds == [100 * n * n for n in range(256)], 'XP curve/table drift')
    require(levels['initialMainSlots'] == 5 and levels['maximumMainSlots'] == 8 and
            levels['slotUnlockLevels'] == inputs['slotUnlock']['thresholds'] and
            levels['slotUnlockEvidenceKey'] in evidence, 'invalid slot unlock policy')


def external_path(root, relative):
    path = PurePosixPath(relative)
    require(not path.is_absolute() and '..' not in path.parts, 'invalid external evidence path')
    result = root.joinpath(*path.parts).resolve()
    require(result.is_relative_to(root), 'external evidence path escapes evidence root')
    return result


def verify_external(pack, inputs, evidence_root, snapshot=None):
    """Explicit full-byte verification; missing inputs always fail closed."""
    root = evidence_root.resolve()
    require(root.is_dir(), f'missing external evidence root: {root}')
    upstream = inputs['upstreamReference']
    reference = json.loads(checked_bytes(external_path(root, upstream['path']),
                                         upstream['sha256'], 'external W0 reference'))
    require({k: reference[k] for k in inputs['reference']} == inputs['reference'],
            'external reference selection drift')
    wasm_source = next(s for s in pack['sources'] if s['id'] == 'snapshot.wasm')
    selected = snapshot.resolve() if snapshot else external_path(root, wasm_source['path'])
    require(selected.exists(), f'missing external snapshot: {selected}')
    snapshot_dir = selected if selected.is_dir() else selected.parent
    snapshot_bytes = {}
    for entry in reference['snapshot']:
        path = (selected if selected.is_file() and entry['file'] == 'client.wasm'
                else snapshot_dir / entry['file'])
        raw = checked_bytes(path, entry['sha256'], f'external snapshot {entry["file"]}')
        require(len(raw) == entry['bytes'], f'external snapshot size mismatch: {entry["file"]}')
        snapshot_bytes[entry['file']] = raw
    original = {}
    for source in pack['sources']:
        if source['id'] == 'snapshot.wasm':
            raw = snapshot_bytes['client.wasm']
            require(hashlib.sha256(raw).hexdigest() == source['sha256'],
                    'external snapshot source hash mismatch')
        else:
            raw = checked_bytes(external_path(root, source['path']), source['sha256'],
                                f'external evidence {source["id"]}')
        original[source['id']] = raw
    w0 = json.loads(original['w0.catalog'])
    for kind, key in [('petals', 'petalRegistry'), ('mobs', 'mobRegistry')]:
        require([{'id': r['id'], 'name': r['name']} for r in w0[key]['entries']]
                == inputs['registries'][kind], f'external {kind} registry selection drift')
    constructors = [{'id': c['id'], 'countCandidate': c['countCandidate'],
                     'values': [{'rarity': v['rarity'], 'raw': v['raw']} for v in c['values']],
                     'descriptions': c['descriptions']} for c in w0['constructors']['entries']]
    require(constructors == inputs['constructors'], 'external constructor selection drift')
    rules = [{k: r[k] for k in ['id', 'candidate', 'currentValue', 'unit'] if k in r}
             for r in json.loads(original['w0.rules'])['rules']]
    require(rules == inputs['rules'], 'external rule selection drift')
    display = inputs['craftDisplay']
    offset = display['wasmFileOffset']
    require(snapshot_bytes['client.wasm'][offset:offset + 20].hex() == display['bytesHex'],
            'external craft display bytes drift')
    for fragment in inputs['wikiSnippets']:
        wiki = json.loads(original[fragment['sourceId']])
        page = next(iter(wiki.get('query', {}).get('pages', {}).values()), {})
        revision = next(iter(page.get('revisions', [])), {})
        require(page.get('title') == fragment['title'] and
                revision.get('revid') == fragment['revision'] and
                revision.get('timestamp') == fragment['timestamp'], 'external wiki revision drift')
        text = revision.get('slots', {}).get('main', {}).get('*', '')
        require(all(s in text for s in fragment['snippets']), 'external wiki excerpt drift')
    primary = original['primary.changelog'].decode()
    require(all(s['text'] in primary for s in inputs['primarySnippets']), 'external primary excerpt drift')
    print(f'Full external evidence verified: {len(original)} sources, '
          f'{len(snapshot_bytes)} snapshot files; no missing inputs skipped')


def number(value):
    return repr(value)


def body(row):
    return '{' + ', '.join(f'.{key} = {number(row[key])}' for key in BODY) + '}'


def generate(pack):
    digest = hashlib.sha256(PACK.read_bytes()).hexdigest()
    lines = ['// Generated by wave/tools/catalog/generate.py. Do not edit.', '#pragma once', '',
             '// clang-format off',
             'namespace wave::catalog::detail {', 'inline const PetalRegistryEntry registry[]{']
    for r in pack['registries']['petals']:
        kind = r['name'].lower().replace(' ', '_')
        lines.append('  {' + str(r['id']) + ', sim::Petal::' + kind + ', ' + json.dumps(r['name']) + '},')
    lines += ['};', 'inline const PetalDefinition petals[]{']
    for r in pack['petals']:
        client = r['clientValues']
        cv = '{true, ' + str(client['offset12']) + ', ' + str(client['offset16']) + '}' if client else '{}'
        summon = r.get('summon', {'mob': 'beetle', 'rarity': 0})
        values = [f'sim::Petal::{r["kind"]}', f'sim::Rarity::{pack["rarities"][r["rarity"]]["name"].lower()}',
                  str(r['clientId']), json.dumps(r['name']), body(r['body']), number(r['reloadSeconds']),
                  'Effect::' + r['effect'], str(r['particles'])] + [number(r[k]) for k in FIELDS] + [cv, json.dumps(r['evidenceKey']),
                  'sim::Mob::' + summon['mob'], 'sim::Rarity::' + pack['rarities'][summon['rarity']]['name'].lower(),
                  '{' + ', '.join('.' + k + ' = ' + (str(r['mechanics'][k]).lower() if k == 'hidden'
                                                    else number(r['mechanics'][k])) for k in MECHANICS) + '}']
        lines.append('  {' + ', '.join(values) + '},')
    lines += ['};', 'inline const MobDefinition mobs[]{']
    for r in pack['mobs']:
        lines.append('  {' + ', '.join([f'sim::Mob::{r["kind"]}',
            f'sim::Rarity::{pack["rarities"][r["rarity"]]["name"].lower()}', str(r['clientId']),
            str(r['segmentClientId']), body(r['body']), str(r['summon']).lower(), json.dumps(r['evidenceKey']), str(r['xp']),
            'MobAI::' + r['ai'], str(r['segments']), str(r['parentClientId']), str(r['reviewRequired']).lower(),
            *[str(r[k]) for k in ['missileHealth', 'missileDamage', 'lightningDamage', 'lightningBounces', 'lifesteal']]]) + '},')
    lines += ['};', '}  // namespace wave::catalog::detail', 'namespace wave::catalog {',
              'inline std::span<const PetalRegistryEntry> petal_registry() { return detail::registry; }',
              'inline const Catalog& dated() {', '  static const Catalog result{' + ', '.join([
              json.dumps(pack['version']), json.dumps(digest), json.dumps(pack['clientBuildHash']),
              json.dumps(pack['clientWasmSha256']), 'detail::petals', 'detail::mobs']) + '};',
              '  return result;', '}', '}  // namespace wave::catalog', '']
    lines += ['namespace wave::catalog {', 'inline const CraftTable& craft_table() {',
              '  static const CraftTable result{{' + ', '.join(map(str, pack['craft']['clientPercent'])) +
              '}, {' + ', '.join(str(round(p * 1000000)) for p in pack['craft']['successProbabilities']) +
              '}, 5, 5, "economy.reconstruction", {' + ', '.join(map(str, pack['craft']['failureLossRange'])) +
              '}, {' + ', '.join(map(str, pack['craft']['failureLossWeights'])) + '}};', '  return result;', '}',
              'inline const LevelTable& level_table() {',
              '  static constexpr LevelTable result{' + str(pack['levels']['maximumLevel']) + ', ' +
              str(pack['levels']['initialMainSlots']) + ', ' + str(pack['levels']['maximumMainSlots']) +
              ', {' + ', '.join(map(str, pack['levels']['slotUnlockLevels'])) + '}};',
              '  return result;', '}', 'inline std::span<const std::uint64_t> xp_thresholds() {',
              '  static constexpr std::uint64_t values[]{' + ', '.join(map(str, pack['levels']['xpThresholds'])) +
              '};', '  return values;', '}', 'inline std::span<const DropDefinition> drop_table() {',
              '  static constexpr DropDefinition values[]{']
    for d in pack['drops']['entries']:
        lines.append('    {sim::Mob::' + d['mob'] + ', sim::Petal::' + d['petal'] + ', sim::Rarity::' +
                     pack['rarities'][d['rarity']]['name'].lower() + ', ' + str(d['probability']) + ', sim::Rarity::' +
                     pack['rarities'][d['mobRarity']]['name'].lower() + '},')
    lines += ['  };', '  return values;', '}', '}  // namespace wave::catalog',
              '// clang-format on', '']
    return '\n'.join(lines)


def self_test(pack):
    mutations = [
        lambda p: p['petals'].append(copy.deepcopy(p['petals'][0])),
        lambda p: p['petals'][0].update(clientId=999),
        lambda p: p['petals'][0].update(evidenceKey='not.registered'),
        lambda p: p['petals'][0]['body'].update(health=float('nan')),
        lambda p: p['petals'][0]['body'].update(health=float('inf')),
        lambda p: p['spawn'].update(specialChance=1.01),
        lambda p: p['drops']['entries'][0].update(probability=-.01),
        lambda p: p['drops']['entries'][0].update(probability=.203),
        lambda p: p['drops']['entries'][0].update(petal='missing'),
        lambda p: p['sources'][0].update(sha256='0' * 64),
        lambda p: p.update(clientBuildHash='0' * 40),
        lambda p: p['registries']['petals'].append(copy.deepcopy(p['registries']['petals'][0])),
        lambda p: p['petals'][0]['clientValues'].update(offset12=999),
        lambda p: p['petals'][0]['body'].update(contact_damage=11),
        lambda p: p['petals'][0].update(reloadSeconds=2.6),
        lambda p: p['mobs'][0]['body'].update(contact_damage=4),
        lambda p: p['mobs'][0].update(segmentClientId=255),
        lambda p: p['evidence'][0]['sources'].append('missing'),
        lambda p: p['craft'].update(failureLossRange=[0,5]),
        lambda p: p['craft'].update(failureLossWeights=[0,0,0,0]),
        lambda p: p['levels']['xpThresholds'].pop(),
        lambda p: p['levels']['xpThresholds'].__setitem__(1, 10),
        lambda p: p['levels'].update(maximumLevel=256),
        lambda p: p['levels'].update(slotUnlockLevels=[16,31,300]),
        lambda p: p['petals'][0]['provenance']['bodyCandidateRanges'].update(health=[1,2]),
        lambda p: p['drops']['entries'].append(copy.deepcopy(p['drops']['entries'][0])),
        lambda p: p['craft']['clientPercent'].__setitem__(0, 59),
        lambda p: p['craft']['clientEvidence'].update(wasmFileOffset=0),
        lambda p: p['spawn'].update(sourceRule='missing'),
        lambda p: p['sources'][0].update(path='elsewhere.json'),
        lambda p: p['petals'][0]['mechanics'].update(vision_multiplier=0),
        lambda p: p['petals'][0]['mechanics'].update(bounces=1.5),
        lambda p: p['petals'][0]['provenance'].update(behaviorKey='mob.crab'),
        lambda p: p['mobs'][0].update(reviewRequired=False),
        lambda p: p['mobs'][0].update(parentClientId=99),
        lambda p: p['drops']['entries'].pop(),
    ]
    for mutate in mutations:
        candidate = copy.deepcopy(pack)
        mutate(candidate)
        try:
            validate(candidate)
        except ValueError:
            continue
        raise AssertionError('invalid catalog unexpectedly accepted')
    print(f'{len(mutations)} invalid catalog fixtures rejected')
    portable_self_test(pack)


def portable_self_test(pack):
    # This tree deliberately has no repository root, reports, reference Wasm,
    # primary full text, or data/evidence directory, and is not named "wave".
    with tempfile.TemporaryDirectory(prefix='w3-catalog-portable-') as directory:
        root = Path(directory)
        source = root / 'arbitrary-name' / 'source'
        script = source / 'tools/catalog/generate.py'
        data = source / 'data/catalogs/20221030'
        header = source / 'server/catalog/generated.hpp'
        for path in [script.parent, data, header.parent]:
            path.mkdir(parents=True)
        shutil.copyfile(Path(__file__), script)
        shutil.copyfile(PACK, data / 'catalog.json')
        bundled = data / EVIDENCE_INPUTS.name
        shutil.copyfile(EVIDENCE_INPUTS, bundled)
        tooltip = data / 'client-tooltips.json'
        shutil.copyfile(PACK.with_name('client-tooltips.json'), tooltip)
        for name in ['behavior-wiki-snapshots.json', 'behavior-review.json']:
            shutil.copyfile(PACK.with_name(name), data / name)
        header.write_text(generate(pack))

        def run(*arguments):
            return subprocess.run([sys.executable, str(script), '--check', *arguments],
                                  cwd=root, capture_output=True, text=True, check=False)

        result = run()
        require(result.returncode == 0, f'renamed standalone package failed: {result.stderr}')
        bundled.write_bytes(bundled.read_bytes() + b' ')
        result = run()
        require(result.returncode != 0 and 'bundled evidence hash mismatch' in result.stderr,
                'tampered bundled evidence unexpectedly accepted')
        shutil.copyfile(EVIDENCE_INPUTS, bundled)
        tooltip.write_bytes(tooltip.read_bytes() + b' ')
        result = run()
        require(result.returncode != 0 and 'client tooltip evidence hash mismatch' in result.stderr,
                'tampered tooltip evidence unexpectedly accepted')
        shutil.copyfile(PACK.with_name('client-tooltips.json'), tooltip)
        for name in ['behavior-wiki-snapshots.json', 'behavior-review.json']:
            path = data / name
            path.write_bytes(path.read_bytes() + b' ')
            result = run()
            require(result.returncode != 0 and 'hash mismatch' in result.stderr,
                    'tampered behavior evidence unexpectedly accepted')
            shutil.copyfile(PACK.with_name(name), path)
        header.write_text(header.read_text() + '// stale\n')
        result = run()
        require(result.returncode != 0 and 'generated catalog is stale' in result.stderr,
                'stale standalone header unexpectedly accepted')
        header.write_text(generate(pack))
        empty = root / 'empty-evidence'
        empty.mkdir()
        result = run('--verify-evidence', '--evidence-root', str(empty))
        require(result.returncode != 0 and 'missing external W0 reference' in result.stderr,
                'missing explicit external evidence unexpectedly skipped')
        reference = empty / 'reports/wave/W0/reference.json'
        reference.parent.mkdir(parents=True)
        reference.write_text('{}')
        result = run('--verify-evidence', '--evidence-root', str(empty))
        require(result.returncode != 0 and 'external W0 reference hash mismatch' in result.stderr,
                'tampered explicit external evidence unexpectedly accepted')
        result = run('--snapshot', str(root))
        require(result.returncode != 0 and 'require --verify-evidence' in result.stderr,
                'snapshot argument unexpectedly ignored')
    print('Renamed standalone package passed; eight integrity/explicit-evidence failures rejected')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--verify-evidence', action='store_true',
                        help='strictly verify all original sources and both snapshot files')
    parser.add_argument('--evidence-root', type=Path,
                        help='external repository/evidence tree containing the original source paths')
    parser.add_argument('--snapshot', type=Path,
                        help='explicit snapshot directory, or client.wasm with client.js beside it')
    args = parser.parse_args()
    if args.verify_evidence and args.evidence_root is None:
        parser.error('--verify-evidence requires an explicit --evidence-root')
    if not args.verify_evidence and (args.evidence_root is not None or args.snapshot is not None):
        parser.error('--evidence-root/--snapshot require --verify-evidence')
    pack = json.loads(PACK.read_text())
    inputs = bundled_evidence()
    validate(pack, inputs)
    if args.verify_evidence:
        verify_external(pack, inputs, args.evidence_root, args.snapshot)
    if args.self_test:
        self_test(pack)
    result = generate(pack)
    if args.check:
        require(HEADER.exists() and HEADER.read_text() == result, 'generated catalog is stale')
    else:
        HEADER.write_text(result)
    print(f'{pack["version"]}: {len(pack["petals"])} petal and {len(pack["mobs"])} mob variants; '
          'bundled evidence and generated structure validated')
    if not args.verify_evidence:
        print('External archives were not requested; use --verify-evidence for full source verification')

if __name__ == '__main__':
    main()
