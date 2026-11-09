"""Minimal Binaryen WAT reader for protocol archaeology.

Usage:
  python3 tools/protocol/wat.py fn 601            # compact pseudo-code of $601
  python3 tools/protocol/wat.py raw 601           # raw WAT body
  python3 tools/protocol/wat.py callers 2153      # functions that call $2153
  python3 tools/protocol/wat.py refs 53744        # functions that reference an address
  python3 tools/protocol/wat.py str 53744 120     # memory bytes as text
  python3 tools/protocol/wat.py strings 40000 60000  # printable strings in a range
"""
import re
import sys

WAT = 'build/wave/reference/client.wat'

TOKEN = re.compile(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+')

def tokenize(text):
    return TOKEN.findall(text)

def parse(tokens, pos=0):
    """Return (node, next_pos); node is list or atom string."""
    assert tokens[pos] == '('
    pos += 1
    out = []
    while True:
        t = tokens[pos]
        if t == '(':
            node, pos = parse(tokens, pos)
            out.append(node)
        elif t == ')':
            return out, pos + 1
        else:
            out.append(t)
            pos += 1

class Module:
    def __init__(self, path=WAT):
        self.path = path
        self.text = open(path, encoding='utf-8').read()
        self.lines = self.text.splitlines()
        self.funcs = {}
        self.data = {}
        by_line = []
        for i, line in enumerate(self.lines):
            m = re.match(r'^ \(func \$(\d+)', line)
            if m:
                by_line.append((i, int(m.group(1))))
        self.by_line = by_line
        # data segments: (data $N (i32.const OFF) "...")
        for i, line in enumerate(self.lines):
            m = re.match(r'^ \(data \$(\d+) \(i32\.const (\d+)\) (".*")\)$', line)
            if m:
                self.data[int(m.group(1))] = (int(m.group(2)), decode_escapes(m.group(3)[1:-1]))

    def func_line(self, n):
        for i, f in self.by_line:
            if f == n:
                return i
        raise KeyError(n)

    def body_text(self, n):
        start = self.func_line(n)
        depth = 0
        for i in range(start, len(self.lines)):
            depth += self.lines[i].count('(') - self.lines[i].count(')')
            if depth <= 0:
                return start + 1, i + 1, '\n'.join(self.lines[start:i + 1])
        raise ValueError('unbalanced function')

    def ast(self, n):
        a, b, text = self.body_text(n)
        tokens = tokenize(text)
        node, _ = parse(tokens, 0)
        return node

    def owner(self, line):
        best = None
        for i, f in self.by_line:
            if i < line:
                best = (i, f)
            else:
                break
        return best

    def memory(self):
        mem = bytearray()
        for n, (off, payload) in self.data.items():
            if off + len(payload) > len(mem):
                mem.extend(b'\0' * (off + len(payload) - len(mem)))
            mem[off:off + len(payload)] = payload
        return bytes(mem)


def decode_escapes(s):
    out = bytearray()
    i = 0
    while i < len(s):
        c = s[i]
        if c != '\\':
            out.extend(c.encode('utf-8'))
            i += 1
            continue
        n = s[i + 1]
        if n == 'n':
            out.append(10); i += 2
        elif n == 't':
            out.append(9); i += 2
        elif n == 'r':
            out.append(13); i += 2
        elif n == '\\':
            out.append(92); i += 2
        elif n == '"':
            out.append(34); i += 2
        elif n == "'":
            out.append(39); i += 2
        elif n in '0123456789abcdefABCDEF':
            out.append(int(s[i + 1:i + 3], 16)); i += 3
        else:
            out.extend(n.encode()); i += 2
    return bytes(out)


# ---------- compact printer ----------

BIN = {
    'i32.add': '+', 'i32.sub': '-', 'i32.mul': '*', 'i32.div_s': '/', 'i32.div_u': '/u',
    'i32.rem_s': '%', 'i32.rem_u': '%u', 'i32.and': '&', 'i32.or': '|', 'i32.xor': '^',
    'i32.shl': '<<', 'i32.shr_s': '>>', 'i32.shr_u': '>>u', 'i32.eq': '==', 'i32.ne': '!=',
    'i32.lt_s': '<', 'i32.lt_u': '<u', 'i32.gt_s': '>', 'i32.gt_u': '>u', 'i32.le_s': '<=',
    'i32.le_u': '<=u', 'i32.ge_s': '>=', 'i32.ge_u': '>=u',
    'f32.add': '+', 'f32.sub': '-', 'f32.mul': '*', 'f32.div': '/', 'f32.eq': '==',
    'f32.ne': '!=', 'f32.lt': '<', 'f32.gt': '>', 'f32.le': '<=', 'f32.ge': '>=',
    'f64.add': '+', 'f64.sub': '-', 'f64.mul': '*', 'f64.div': '/', 'f64.eq': '==',
}
UN = {'i32.eqz': '!', 'i32.clz': 'clz', 'i32.ctz': 'ctz', 'i32.popcnt': 'popcnt', 'f32.neg': '-', 'f32.abs': 'abs'}
LOADS = {'i32.load': 'i32', 'i32.load8_u': 'u8', 'i32.load8_s': 'i8', 'i32.load16_u': 'u16',
         'i32.load16_s': 'i16', 'f32.load': 'f32', 'f64.load': 'f64', 'i64.load': 'i64'}
STORES = {'i32.store': 'i32', 'i32.store8': 'u8', 'i32.store16': 'u16', 'f32.store': 'f32',
          'f64.store': 'f64', 'i64.store': 'i64'}


def conststr(x):
    try:
        v = int(x, 0)
    except ValueError:
        return x
    if v >= 2 ** 31:
        v -= 2 ** 32
    return str(v)


def fmt(node, prec=0):
    if isinstance(node, str):
        return node
    if not node:
        return '()'
    h = node[0]
    if h == 'i32.const':
        return conststr(node[1])
    if h == 'i64.const':
        return conststr(node[1]) + 'L'
    if h in ('f32.const', 'f64.const'):
        return node[1]
    if h == 'local.get':
        return 'l' + node[1]
    if h == 'global.get':
        return 'g' + node[1]
    if h == 'local.set':
        return 'l%s = %s' % (node[1], fmt(node[2]))
    if h == 'local.tee':
        return '(l%s = %s)' % (node[1], fmt(node[2]))
    if h in LOADS:
        typ = LOADS[h]
        args = node[1:]
        off = 0
        if args and isinstance(args[0], str) and args[0].startswith('offset='):
            off = int(args[0].split('=')[1], 0); args = args[1:]
        if args and isinstance(args[0], str) and args[0].startswith('align='):
            args = args[1:]
        base = fmt(args[0]) if args else '?'
        return '*(%s*)(%s%s)' % (typ, base, ('+%d' % off) if off else '')
    if h in STORES:
        typ = STORES[h]
        args = node[1:]
        off = 0
        if args and isinstance(args[0], str) and args[0].startswith('offset='):
            off = int(args[0].split('=')[1], 0); args = args[1:]
        if args and isinstance(args[0], str) and args[0].startswith('align='):
            args = args[1:]
        if len(args) == 2:
            base, val = args
            return '*(%s*)(%s%s) = %s' % (typ, fmt(base), ('+%d' % off) if off else '', fmt(val))
        # multi-value store (i64.store etc.)
        return 'store(%s, %s)' % (', '.join(fmt(a) for a in args), typ)
    if h in BIN and len(node) == 3:
        p = 6
        s = '%s %s %s' % (fmt(node[1], p), BIN[h], fmt(node[2], p + 1))
        return '(%s)' % s if prec > p else s
    if h in UN and len(node) == 2:
        return '%s(%s)' % (UN[h], fmt(node[1]))
    if h == 'select':
        return 'select(%s)' % ', '.join(fmt(a) for a in node[1:])
    if h == 'call':
        name = node[1]
        if name.startswith('$') and name[1:].isdigit():
            name = 'f' + name
        return '%s(%s)' % (name, ', '.join(fmt(a) for a in node[2:]))
    if h == 'call_indirect':
        return 'call_indirect%s(%s)' % (fmt(node[1]) if len(node) > 1 and not isinstance(node[1], list) else '', ', '.join(fmt(a) for a in node[2:] if isinstance(a, list)))
    if h in ('block', 'loop'):
        i = 1
        label = None
        if i < len(node) and isinstance(node[i], str) and node[i].startswith('$'):
            label = node[i]; i += 1
        if i < len(node) and isinstance(node[i], list) and node[i] and node[i][0] == 'result':
            i += 1
        rest = node[i:]
        body = '\n'.join('  ' + line for line in block(rest).splitlines())
        return '%s %s {\n%s\n}' % (h, label or '', body)
    if h == 'if':
        i = 1
        result = None
        if i < len(node) and isinstance(node[i], list) and node[i] and node[i][0] == 'result':
            result = ' '.join(node[i][1:]); i += 1
        cond = fmt(node[i]) if i < len(node) else '?'
        then = node[i + 1] if i + 1 < len(node) else []
        els = node[i + 2] if i + 2 < len(node) else None
        thenbody = then[1:] if isinstance(then, list) and then and then[0] == 'then' else then
        s = 'if (%s)%s {\n%s\n}' % (cond, (' -> ' + result) if result else '', '\n'.join('  ' + l for l in block(thenbody).splitlines()))
        if els:
            ebody = els[1:] if els and els[0] == 'else' else els
            s += ' else {\n%s\n}' % '\n'.join('  ' + l for l in block(ebody).splitlines())
        return s
    if h == 'br':
        return 'br %s' % node[1]
    if h == 'br_if':
        return 'if (%s) br %s' % (fmt(node[2]), node[1])
    if h == 'br_table':
        return 'br_table[%s](%s)' % (', '.join(node[1:-1]), fmt(node[-1]))
    if h == 'return':
        return 'return ' + ', '.join(fmt(a) for a in node[1:])
    if h == 'drop':
        return 'drop(%s)' % fmt(node[1])
    if h == 'nop':
        return 'nop'
    if h == 'unreachable':
        return 'unreachable'
    if h == 'memory.copy':
        return 'memcpy(%s, %s, %s)' % tuple(fmt(a) for a in node[1:])
    if h == 'memory.fill':
        return 'memset(%s, %s, %s)' % tuple(fmt(a) for a in node[1:])
    return '%s(%s)' % (h, ', '.join(fmt(a) for a in node[1:]))


def block(nodes):
    out = []
    for n in nodes:
        if isinstance(n, list) and n and n[0] in ('local.set',) and len(n) > 2:
            out.append(fmt(n) + ';')
        else:
            out.append(fmt(n) + (';' if isinstance(n, list) and n and n[0] in STORES else ''))
    return '\n'.join(out)


def main(argv):
    m = Module()
    cmd = argv[1]
    if cmd == 'fn':
        start, end, _ = m.body_text(int(argv[2]))
        print('$%s lines %d-%d' % (argv[2], start, end))
        print(block(m.ast(int(argv[2]))[2:]))
    elif cmd == 'raw':
        print(m.body_text(int(argv[2]))[2])
    elif cmd == 'callers':
        target = int(argv[2])
        pat = re.compile(r'call \$%d\b' % target)
        for i, line in enumerate(m.lines):
            if pat.search(line):
                own = m.owner(i)
                print('line %d  in $%d (starts %d)' % (i + 1, own[1], own[0] + 1))
    elif cmd == 'refs':
        addr = int(argv[2])
        pat = re.compile(r'(?<![0-9])%d(?![0-9])' % addr)
        for i, line in enumerate(m.lines):
            if 'i32.const %d' % addr in line:
                own = m.owner(i)
                print('line %d  in $%d (starts %d)' % (i + 1, own[1], own[0] + 1))
    elif cmd == 'str':
        addr = int(argv[2]); size = int(argv[3])
        mem = m.memory()
        raw = mem[addr:addr + size]
        print(raw.decode('utf-8', 'replace'))
    elif cmd == 'strings':
        lo, hi = int(argv[2]), int(argv[3])
        mem = m.memory()
        for mt in re.finditer(rb'[ -~]{4,}', mem[lo:hi]):
            print(mt.start() + lo, repr(mt.group().decode()))

if __name__ == '__main__':
    main(sys.argv)
