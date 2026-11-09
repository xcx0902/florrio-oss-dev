"""Print printable C-string constants referenced by i32.const in a function."""
import sys
sys.path.insert(0, 'tools/protocol')
import wat

def walk(n, out):
    if isinstance(n, list):
        if len(n) == 2 and n[0] == 'i32.const':
            out.append(n[1])
        for x in n:
            walk(x, out)

m = wat.Module()
mem = m.memory()
for arg in sys.argv[1:]:
    n = int(arg)
    out = []
    walk(m.ast(n), out)
    seen = set()
    print(f'${n}:')
    for v in out:
        try:
            a = int(v, 0)
        except ValueError:
            continue
        if a < 1024 or a >= len(mem) or a in seen:
            continue
        seen.add(a)
        e = mem.find(b'\0', a, min(a + 120, len(mem)))
        if e < 0:
            continue
        s = bytes(mem[a:e])
        if len(s) >= 2 and all(32 <= c < 127 for c in s):
            print(f'  {a}: {s.decode()}')
