"""Line-aware structured viewer for the reference client WAT.

The Binaryen WAT is one huge nested s-expression; `wat.py fn` prints a compact
form but loses line numbers.  This tool keeps the start line of every node so a
subtree can be located and quoted exactly.

Usage:
  python3 tools/protocol/wtree.py at 428041          # enclosing chain + subtree
  python3 tools/protocol/wtree.py at 428041 --up 3   # also print 3 parents
  python3 tools/protocol/wtree.py func 601 397800 398600
"""
import sys

from wat import Module, fmt, LOADS, STORES

TOKEN = None


def tokenize_with_lines(text, base_line):
    import re
    pat = re.compile(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+')
    out = []
    line = base_line
    pos = 0
    for m in pat.finditer(text):
        tok = m.group(0)
        # count newlines before this token
        line += text.count('\n', pos, m.start())
        pos = m.start()
        out.append((tok, line))
    return out


class Node:
    __slots__ = ('head', 'args', 'line', 'end')

    def __init__(self, head, args, line, end):
        self.head = head
        self.args = args
        self.line = line
        self.end = end

    def __repr__(self):
        return '<%s @%d>' % (self.head, self.line)


def parse(tokens, i):
    assert tokens[i][0] == '('
    start_line = tokens[i][1]
    i += 1
    items = []
    while tokens[i][0] != ')':
        if tokens[i][0] == '(':
            node, i = parse(tokens, i)
            items.append(node)
        else:
            items.append(tokens[i][0])
            i += 1
    end_line = tokens[i][1]
    head = items[0] if items else ''
    return Node(head, items[1:], start_line, end_line), i + 1


def build(m, n):
    a, b, text = m.body_text(n)
    toks = tokenize_with_lines(text, a)
    root, _ = parse(toks, 0)
    return root


def walk(node, fn, depth=0):
    fn(node, depth)
    for x in node.args:
        if isinstance(x, Node):
            walk(x, fn, depth + 1)


def find_chain(root, line):
    chain = []

    def visit(node, depth):
        if node.line <= line <= node.end:
            chain.append(node)
            for x in node.args:
                if isinstance(x, Node):
                    visit(x, depth + 1)

    visit(root, 0)
    return chain


def to_list(node):
    if isinstance(node, str):
        return node
    return [node.head] + [to_list(x) for x in node.args]


def render(node, indent=0):
    pad = '  ' * indent
    if node.head in ('block', 'loop'):
        label = ''
        rest = node.args
        if rest and isinstance(rest[0], str) and rest[0].startswith('$'):
            label = rest[0]
            rest = rest[1:]
        print('%s;%d %s %s {' % (pad, node.line, node.head, label))
        for x in rest:
            if isinstance(x, Node) and x.head in ('result', 'param'):
                print('%s  (%s)' % (pad, ' '.join(map(str, x.args))))
            elif isinstance(x, Node):
                render(x, indent + 1)
            else:
                print('%s  %s' % (pad, x))
        print('%s} ;%d' % (pad, node.end))
        return
    if node.head == 'if':
        rest = list(node.args)
        label = ''
        if rest and isinstance(rest[0], str) and rest[0].startswith('$'):
            label = rest[0]
            rest = rest[1:]
        cond = rest[0] if rest else None
        print('%s;%d if %s (%s) {' % (pad, node.line, label, fmt(to_list(cond))))
        for part in rest[1:]:
            if isinstance(part, Node) and part.head in ('then', 'else'):
                print('%s  %s {' % (pad, part.head))
                for x in part.args:
                    if isinstance(x, Node):
                        render(x, indent + 2)
                    else:
                        print('%s    %s' % (pad, x))
                print('%s  }' % pad)
            elif isinstance(part, Node):
                render(part, indent + 1)
        print('%s} ;%d' % (pad, node.end))
        return
    if node.head in ('then', 'else'):
        print('%s%s {' % (pad, node.head))
        for x in node.args:
            if isinstance(x, Node):
                render(x, indent + 1)
        print('%s}' % pad)
        return
    print('%s;%d %s' % (pad, node.line, fmt(to_list(node))))


def render_range(node, lo, hi, indent):
    if not (node.line <= hi and node.end >= lo):
        return
    if node.head in ('block', 'loop', 'if', 'then', 'else'):
        pad = '  ' * indent
        head = node.head
        extra = ''
        if head in ('block', 'loop') and node.args and isinstance(node.args[0], str) and node.args[0].startswith('$'):
            extra = ' ' + node.args[0]
        elif head == 'if':
            cond = next((a for a in node.args if isinstance(a, Node)), None)
            if cond is not None:
                extra = ' (' + fmt(to_list(cond)) + ')'
        print('%s;%d %s%s {' % (pad, node.line, head, extra))
        for x in node.args:
            if isinstance(x, Node):
                render_range(x, lo, hi, indent + 1)
        print('%s} ;%d' % (pad, node.end))
        return
    if lo <= node.line <= hi:
        print('%s;%d %s' % ('  ' * indent, node.line, fmt(to_list(node))))


def main(argv):
    m = Module()
    cmd = argv[1]
    if cmd == 'func':
        n = int(argv[2]); lo = int(argv[3]); hi = int(argv[4])
        root = build(m, n)
        for x in root.args:
            if isinstance(x, Node):
                render_range(x, lo, hi, 0)
    elif cmd == 'at':
        line = int(argv[2])
        up = int(argv[4]) if len(argv) > 4 and argv[3] == '--up' else 0
        # locate function containing the line
        owner = m.owner(line - 1)
        if not owner:
            print('line not in any function')
            return
        root = build(m, owner[1])
        chain = find_chain(root, line)
        if not chain:
            print('not found')
            return
        top = chain[max(0, len(chain) - 1 - up)]
        print('# $%d, chain: %s' % (owner[1], ' > '.join('%s@%d' % (c.head, c.line) for c in chain)))
        render(top)
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    main(sys.argv)
