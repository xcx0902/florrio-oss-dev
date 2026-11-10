"""Memory-access census for the reference client WAT.

Parses every function once and records each load/store with its immediate
offset and a rendered base expression.  Used to answer "does anything ever
read field +N of object X?" without relying on the reconstructed server.

Usage:
  python3 tools/protocol/memops.py build          # write build/wave/analysis/memops.jsonl
  python3 tools/protocol/memops.py q load 8 u8    # query by width/offset
  python3 tools/protocol/memops.py base <substr>  # query base expression
"""
import json
import sys

from wat import Module, LOADS, STORES, fmt

OUT = 'build/wave/analysis/memops.jsonl'


def off_of(node):
    off = 0
    for a in node[1:]:
        if isinstance(a, str) and a.startswith('offset='):
            off = int(a.split('=')[1], 0)
    return off


def operands(node):
    return [a for a in node[1:] if not (isinstance(a, str) and (a.startswith('offset=') or a.startswith('align=')))]


def build():
    m = Module()
    n = 0
    with open(OUT, 'w') as f:
        for _, fn in m.by_line:
            root = m.ast(fn)
            stack = [root]
            while stack:
                node = stack.pop()
                if not isinstance(node, list):
                    continue
                if node and node[0] in LOADS or (node and node[0] in STORES):
                    ops = operands(node)
                    rec = {
                        'fn': fn,
                        'op': node[0],
                        'width': (LOADS.get(node[0]) or STORES.get(node[0])),
                        'offset': off_of(node),
                        'base': fmt(ops[0]) if ops else '',
                        'value': fmt(ops[1]) if len(ops) > 1 else '',
                        'kind': 'load' if node[0] in LOADS else 'store',
                    }
                    f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                    n += 1
                for a in node:
                    if isinstance(a, list):
                        stack.append(a)
    print('wrote %d ops' % n)


def load_records():
    with open(OUT) as f:
        for line in f:
            yield json.loads(line)


def main(argv):
    if argv[1] == 'build':
        build()
        return
    recs = list(load_records())
    if argv[1] == 'q':
        kind, off, width = argv[2], int(argv[3]), argv[4]
        for r in recs:
            if r['kind'] == kind and r['offset'] == off and (width == '*' or r['width'] == width):
                print('$%-5d %-11s +%-5d %-6s base=%-40s value=%s' % (r['fn'], r['op'], r['offset'], r['width'], r['base'][:40], r['value'][:50]))
    elif argv[1] == 'base':
        sub = argv[2]
        for r in recs:
            if sub in r['base']:
                print('$%-5d %-11s +%-5d base=%-40s value=%s' % (r['fn'], r['op'], r['offset'], r['base'][:40], r['value'][:50]))


if __name__ == '__main__':
    main(sys.argv)
