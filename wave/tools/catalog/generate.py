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
EVIDENCE_SHA256 = 'ac775f56e5a569189b1aae1722eca2af1118c9eefd637d2a4183a1e0b71a5486'
KINDS = ('basic', 'rose', 'faster', 'leaf', 'stinger', 'peas', 'grapes', 'web',
         'missile', 'egg', 'honey', 'cactus')
MOBS = ('bee', 'ladybug', 'baby_ant', 'rock', 'centipede', 'worker_ant', 'dark_ladybug',
        'evil_centipede', 'soldier_ant', 'spider', 'hornet', 'beetle')
BODY = ('radius', 'health', 'speed_per_second', 'contact_damage', 'contact_heal',
        'poison_per_tick', 'poison_ticks', 'contact_cooldown')
FIELDS = ('activationSeconds', 'heal', 'passiveHealPerSecond', 'friendlyMobHeal',
          'rotationBonus', 'projectileSpeed', 'range', 'durationSeconds',
          'slowMultiplier', 'healthBonus', 'areaRadius')
EFFECTS = {'contact', 'rose', 'leaf', 'projectile', 'poison_projectile', 'web',
           'summon', 'faster', 'honey', 'cactus'}


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


def validate(pack, inputs=None):
    if inputs is None:
        inputs = bundled_evidence()
    walk(pack)
    require(pack['schemaVersion'] == 1 and pack['version'] == '20221030-w3.1', 'unlocked version')
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
            require(type(row['rarity']) is int and 0 <= row['rarity'] < 6, 'invalid rarity')
            require(row['clientId'] in registry, 'unknown client reference')
            require(row['evidenceKey'] in evidence, 'unregistered evidenceKey')
            require(row['provenance']['server'] == 'reconstruction', 'unsubstantiated authoritative claim')
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
                require(row['reloadSeconds'] > 0 and all(row[k] >= 0 for k in FIELDS), 'invalid effect value')
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
                ctor = next((c for c in inputs['constructors'] if c['id'] == row['clientId']), None)
                if ctor:
                    require(row['particles'] == ctor['countCandidate'], 'original particle count drift')
                    observed = ctor['values'][row['rarity']]['raw']
                    require(row['clientValues']['offset12'] == observed[1] and
                            row['clientValues']['offset16'] == observed[2], 'raw client value drift')
            else:
                require(type(row['xp']) is int and row['xp'] >= 0, 'invalid mob XP')
                require(row['segmentClientId'] == 0 or row['segmentClientId'] in registry,
                        'unknown segment reference')
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
    for drop in pack['drops']['entries']:
        require(drop['mob'] in MOBS and drop['petal'] in KINDS and type(drop['rarity']) is int and
                0 <= drop['rarity'] < 6 and type(drop['mobRarity']) is int and
                0 <= drop['mobRarity'] < 6, 'unknown drop reference')
        probabilities.append(drop['probability'])
        key = (drop['mob'], drop['mobRarity'], drop['petal'], drop['rarity'])
        require(key not in drop_keys, 'duplicate drop rule')
        drop_keys.add(key)
        population = (drop['mob'], drop['mobRarity'])
        totals[population] = totals.get(population, 0) + drop['probability']
    require(all(type(p) in (int, float) and 0 <= p <= 1 for p in probabilities), 'probability out of range')
    require(all(total <= 1 for total in totals.values()), 'drop probability total exceeds one')
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
        values = [f'sim::Petal::{r["kind"]}', f'sim::Rarity::{pack["rarities"][r["rarity"]]["name"].lower()}',
                  str(r['clientId']), json.dumps(r['name']), body(r['body']), number(r['reloadSeconds']),
                  'Effect::' + r['effect'], str(r['particles'])] + [number(r[k]) for k in FIELDS] + [cv, json.dumps(r['evidenceKey'])]
        lines.append('  {' + ', '.join(values) + '},')
    lines += ['};', 'inline const MobDefinition mobs[]{']
    for r in pack['mobs']:
        lines.append('  {' + ', '.join([f'sim::Mob::{r["kind"]}',
            f'sim::Rarity::{pack["rarities"][r["rarity"]]["name"].lower()}', str(r['clientId']),
            str(r['segmentClientId']), body(r['body']), str(r['summon']).lower(), json.dumps(r['evidenceKey']), str(r['xp'])]) + '},')
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
        lambda p: p['drops']['entries'][0].update(petal='missing'),
        lambda p: p['sources'][0].update(sha256='0' * 64),
        lambda p: p.update(clientBuildHash='0' * 40),
        lambda p: p['registries']['petals'].append(copy.deepcopy(p['registries']['petals'][0])),
        lambda p: p['petals'][0]['clientValues'].update(offset12=10),
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
    print('Renamed standalone package passed; five integrity/explicit-evidence failures rejected')


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
