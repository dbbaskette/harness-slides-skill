"""Alignment audit and settle for an existing deck, and a slide-by-slide change summary.

Polish means the near-misses are gone: peers in a row share a top edge, peers in a column a left
edge, same-size panels one size, near-equal gaps are equal. This finds those near-misses, fixes the
ones geometry alone decides, and lists the rest for the reviewer. Geometry only: no wording, no
object added, removed or reordered. Only the offset and size tags of moved shapes are rewritten;
every other byte of the package is kept. Python standard library only."""
import collections
import hashlib
import importlib.util
import json
import re
import sys
import xml.parsers.expat
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('pptx_tools', Path(__file__).with_name('pptx_tools.py'))
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)
PT = 12700
TAG = re.compile(rb'<(?:"[^"]*"|\x27[^\x27]*\x27|[^\x27">])*>')
FILLS = ('solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill')
PLAIN = ('rect', 'roundRect', 'round1Rect', 'round2SameRect', 'snip1Rect')


def shapes(data):
    """Every drawn shape and picture on a slide, with its place in slide space and how its text sits."""
    parser = xml.parsers.expat.ParserCreate(namespace_separator='}')
    stack, groups, found, state = [], [], [], dict(shape=None)

    def start(name, attrs):
        local = name.rsplit('}', 1)[-1]
        stack.append(local)
        index = parser.CurrentByteIndex
        shape = state['shape']
        if local == 'grpSp' and 'spTree' in stack:
            groups.append(dict(depth=len(stack)))
        elif local in ('sp', 'pic') and 'spTree' in stack and shape is None:
            state['shape'] = dict(kind=local, id=None, depth=len(stack), start=index, text='', sizes=[], fill=None,
                                  style_fill=False, plain=False, look=[], rot=0, anchor='t', insets=None, body=False,
                                  frames=[dict(g) for g in groups])
        elif shape is None and groups and len(stack) >= 3 and stack[-2] == 'xfrm' and stack[-3] == 'grpSpPr':
            if local in ('off', 'chOff'):
                groups[-1][local] = (int(attrs['x']), int(attrs['y']))
            elif local in ('ext', 'chExt'):
                groups[-1][local] = (int(attrs['cx']), int(attrs['cy']))
        if shape is None:
            return
        parent = stack[-2] if len(stack) > 1 else ''
        # What the shape looks like apart from where it is and what it says, whatever the XML's spelling.
        if not (local in ('off', 'ext') and parent == 'xfrm'):
            shape['look'].append((local, tuple(sorted(attrs.items()))))
        if local == 'cNvPr' and shape['id'] is None:
            shape['id'] = attrs.get('id')
            shape['name'] = attrs.get('name', '')
        elif local == 'xfrm' and parent == 'spPr':
            shape['rot'] = int(attrs.get('rot', '0'))
        elif local in ('off', 'ext') and parent == 'xfrm' and len(stack) >= 3 and stack[-3] == 'spPr':
            match = TAG.match(data, index)
            shape[local] = (int(attrs['x']), int(attrs['y'])) if local == 'off' else (int(attrs['cx']), int(attrs['cy']))
            shape[local + '_span'] = (index, match.end())
        elif parent == 'spPr' and local in FILLS:
            shape['fill'] = True
        elif parent == 'spPr' and local == 'noFill':
            shape['fill'] = False
        elif parent == 'spPr' and local == 'prstGeom':
            shape['plain'] = attrs.get('prst') in PLAIN
        elif local == 'fillRef' and parent == 'style':
            shape['style_fill'] = attrs.get('idx', '0') != '0'
        elif local == 'bodyPr' and parent == 'txBody':
            shape['body'] = True
            shape['anchor'] = attrs.get('anchor', 't')
            shape['insets'] = tuple(attrs.get(k) for k in ('tIns', 'bIns', 'lIns', 'rIns'))
        elif local in ('rPr', 'defRPr', 'endParaRPr') and attrs.get('sz'):
            shape['sizes'].append(int(attrs['sz']))

    def chars(text):
        if state['shape'] is not None and stack and stack[-1] == 't':
            state['shape']['text'] += text

    def end(name):
        local = name.rsplit('}', 1)[-1]
        shape = state['shape']
        if shape is not None and local == shape['kind'] and len(stack) == shape['depth']:
            close = TAG.match(data, parser.CurrentByteIndex)
            shape['end'] = close.end() if close else parser.CurrentByteIndex
            state['shape'] = None
            if shape['id'] and 'off' in shape and 'ext' in shape and all(k in f for f in shape['frames'] for k in ('off', 'ext', 'chOff', 'chExt')):
                found.append(shape)
        elif local == 'grpSp' and groups and groups[-1]['depth'] == len(stack):
            groups.pop()
        stack.pop()

    parser.StartElementHandler, parser.EndElementHandler, parser.CharacterDataHandler = start, end, chars
    parser.Parse(data, True)
    for shape in found:
        x, y = shape['off']
        w, h = shape['ext']
        sx = sy = 1.0
        for frame in reversed(shape['frames']):
            fx = frame['ext'][0] / frame['chExt'][0] if frame['chExt'][0] else 1.0
            fy = frame['ext'][1] / frame['chExt'][1] if frame['chExt'][1] else 1.0
            x, y = frame['off'][0] + (x - frame['chOff'][0]) * fx, frame['off'][1] + (y - frame['chOff'][1]) * fy
            w, h, sx, sy = w * fx, h * fy, sx * fx, sy * fy
        shape.update(x=x / PT, y=y / PT, w=w / PT, h=h / PT, sx=sx, sy=sy, text=shape['text'].strip(),
                     filled=shape['kind'] == 'pic' or (shape['fill'] if shape['fill'] is not None else shape['style_fill']))
        shape['first'] = dict(x=shape['x'], y=shape['y'], w=shape['w'], h=shape['h'])
    return found


def similar(a, b, tolerance=0.06):
    return (a['kind'] == b['kind'] and abs(a['w'] - b['w']) <= tolerance * max(a['w'], b['w']) + 1
            and abs(a['h'] - b['h']) <= tolerance * max(a['h'], b['h']) + 1)


def peer_groups(items, axis):
    key, order = ('y', 'x') if axis == 'row' else ('x', 'y')
    seen, result = set(), []
    for a in sorted(items, key=lambda s: -s['w'] * s['h']):
        if a['id'] in seen:
            continue
        group = [b for b in items if b['id'] not in seen and similar(a, b) and abs(a[key] - b[key]) <= 10]
        if len(group) >= 2:
            group.sort(key=lambda s: s[order])
            result.append(group)
            seen.update(s['id'] for s in group)
    return result


def common(values, others):
    """The value most members already have; on a tie, the one other shapes on the slide also use."""
    rounded = [round(v, 1) for v in values]
    counts = collections.Counter(rounded).most_common()
    if len(counts) > 1 and counts[0][1] == counts[1][1]:
        return max(set(rounded), key=lambda v: (sum(1 for o in others if abs(o - v) < 0.25), -rounded.index(v)))
    return counts[0][0]


def inside(child, holder):
    return (child is not holder and child['w'] * child['h'] < holder['w'] * holder['h']
            and child['x'] >= holder['x'] - 1 and child['y'] >= holder['y'] - 1
            and child['x'] + child['w'] <= holder['x'] + holder['w'] + 1 and child['y'] + child['h'] <= holder['y'] + holder['h'] + 1)


def spread(group, key):
    return max(s[key] for s in group) - min(s[key] for s in group)


def settle(items, width, height):
    """Move and size shapes in place (points, slide space). Returns the fixes made and what is left to a reviewer."""
    k = 960 / width  # thresholds were tuned on a 960 pt wide canvas
    fixes, review = [], []

    def header(s):
        return bool(s['text']) and s['y'] * k < 112 and s['w'] * k > 450 and max(s['sizes'] or [0]) * k >= 1700

    def peer(s):
        # Smaller shapes are icon parts and badges: they only move with what holds them.
        return (not header(s) and s['rot'] % 21600000 == 0 and s['y'] < 0.935 * height and min(s['w'], s['h']) * k >= 30
                and 0 <= s['x'] <= width)

    def move(s, dx, dy, why):
        carried = [c for c in items if inside(c, s)]
        for c in [s] + carried:
            c['x'] += dx
            c['y'] += dy
        fixes.append(dict(object=s['id'], text=s['text'][:40], change=why, carried=len(carried), dx=round(dx, 1), dy=round(dy, 1)))

    for _ in range(4):
        before = len(fixes)
        peers = [s for s in items if peer(s)]
        for axis in ('row', 'col'):
            key, size, order, across = ('y', 'h', 'x', 'w') if axis == 'row' else ('x', 'w', 'y', 'h')
            for group in peer_groups(peers, axis):
                if group[0]['kind'] == 'pic' and (spread(group, 'w') > 0.3 or spread(group, 'h') > 0.3):
                    continue  # different artwork is centred by eye
                # Unfilled text is seen where its words sit, not where its box is. Top-anchored boxes with the same
                # insets start their first line at the box top; centred or bottom-anchored text depends on its lines.
                loose = [s for s in group if s['kind'] == 'sp' and s['text'] and not s['filled']]
                if loose and (any(s['anchor'] != 't' for s in loose) or len({s['insets'] for s in loose}) > 1):
                    continue
                goal = common([s[key] for s in group], [o[key] for o in peers if o not in group])
                twins = spread(group, 'w') <= 0.5 and spread(group, 'h') <= 0.5
                for s in group:
                    d = goal - s[key]
                    if 0.25 < abs(d) <= 10 / k and (twins or min(s['w'], s['h']) * k >= 80):
                        move(s, d if axis == 'col' else 0, d if axis == 'row' else 0,
                             ('top' if axis == 'row' else 'left') + ' edge matched to its ' + ('row' if axis == 'row' else 'column'))
                # Only visible plain panels are resized, and only by a hair: text boxes and artwork keep their size.
                if all(s['kind'] == 'sp' and s['plain'] and s['filled'] and s[size] * k >= 80 for s in group):
                    goal = common([s[size] for s in group], [o[size] for o in peers if o not in group])
                    for s in group:
                        d = goal - s[size]
                        if 0.25 < abs(d) <= 0.03 * s[size]:
                            s[size] += d
                            fixes.append(dict(object=s['id'], text=s['text'][:40], change=('height' if axis == 'row' else 'width') + ' matched to its ' + ('row' if axis == 'row' else 'column'), d=round(d, 1)))
                gaps = [b[order] - (a[order] + a[across]) for a, b in zip(group, group[1:])]
                holders = [frozenset(c['id'] for c in peers if inside(s, c)) for s in group]  # shapes in different panels follow their panels
                if len(group) >= 3 and len(set(holders)) == 1 and min(gaps) > 0 and 0.4 < max(gaps) - min(gaps) <= 8 / k and spread(group, across) < 0.5:
                    gap = (group[-1][order] - group[0][order] - sum(s[across] for s in group[:-1])) / (len(group) - 1)
                    position = group[0][order]
                    for s in group[:-1]:
                        d = position - s[order]
                        if abs(d) > 0.25:
                            move(s, d if axis == 'row' else 0, d if axis == 'col' else 0, 'spacing along its ' + ('row' if axis == 'row' else 'column') + ' made even')
                        position = s[order] + s[across] + gap
        if len(fixes) == before:
            break
    # What geometry alone cannot decide: say it, so the reviewer looks.
    peers = [s for s in items if peer(s)]
    for group in peer_groups(peers, 'row'):
        ids = [s['id'] for s in group]
        anchors = {s['anchor'] for s in group if s['text']}
        if len(anchors) > 1 and all(s['filled'] for s in group):
            review.append(dict(objects=ids, note='Cards in a row anchor their text differently (' + '/'.join(sorted(anchors)) + '), so their headings sit at different heights.'))
        if all(s['filled'] and s['kind'] == 'sp' for s in group) and 0.5 < spread(group, 'w') <= 0.06 * group[0]['w']:
            review.append(dict(objects=ids, note=f"Cards in a row differ in width by {spread(group, 'w'):.1f} pt; equalising them changes the gaps."))
    blocks = [s for s in peers if s['filled'] and s['w'] * k >= 120]
    heads = [s for s in items if header(s)]
    if blocks and heads:
        left, right = min(s['x'] for s in blocks), max(s['x'] + s['w'] for s in blocks)
        head_left, head_right = min(s['x'] for s in heads), max(s['x'] + s['w'] for s in heads)
        if (right - left) * k > 600 and abs(left - head_left) <= 3 / k and 12 / k < head_right - right < 80 / k:
            review.append(dict(objects=[s['id'] for s in blocks], note=f'Content block starts at the title margin but ends {head_right - right:.0f} pt short of the right margin; widen it or centre it.'))
    return fixes, review


def rewrite(data, items):
    """Rewrite only the offset and size tags of shapes whose place changed."""
    edits = []
    for s in items:
        first = s['first']
        dx, dy, dw, dh = s['x'] - first['x'], s['y'] - first['y'], s['w'] - first['w'], s['h'] - first['h']
        if max(abs(dx), abs(dy)) > 0.01:
            values = dict(x=round(s['off'][0] + dx * PT / s['sx']), y=round(s['off'][1] + dy * PT / s['sy']))
            edits.append((s['off_span'], values))
        if max(abs(dw), abs(dh)) > 0.01:
            values = dict(cx=round(s['ext'][0] + dw * PT / s['sx']), cy=round(s['ext'][1] + dh * PT / s['sy']))
            edits.append((s['ext_span'], values))
    for (begin, finish), values in sorted(edits, key=lambda e: -e[0][0]):
        tag = data[begin:finish]
        for name, value in values.items():
            tag, count = re.subn(rb'(\s' + name.encode() + rb'=)(["\x27])-?\d+\2', lambda m: m.group(1) + m.group(2) + str(value).encode() + m.group(2), tag, count=1)
            if count != 1:
                raise ValueError('Unsupported geometry tag')
        data = data[:begin] + tag + data[finish:]
    return data


def canvas(pkg):
    size = pkg.xml('ppt/presentation.xml').find('p:sldSz', tools.NS).attrib
    return int(size['cx']) / PT, int(size['cy']) / PT


def align(file, output=None, only=None):
    pkg, source = tools.load(file)
    width, height = canvas(pkg)
    report, changed = [], {}
    for number, ident, part in tools.slides(pkg):
        if only and number != only:
            continue
        data = pkg.zip.read(part)
        items = shapes(data)
        fixes, review = settle(items, width, height)
        if fixes or review:
            report.append(dict(number=number, id=ident, fixes=fixes, review=review))
        if fixes:
            changed[part] = rewrite(data, items)
    result = dict(sourceSha256=hashlib.sha256(source).hexdigest(), slides=report,
                  fixes=sum(len(s['fixes']) for s in report), review=sum(len(s['review']) for s in report))
    if output:
        if Path(output).resolve() == Path(file).resolve():
            raise ValueError('Refusing to settle the source in place; choose a new output file')
        if Path(output).exists():
            raise ValueError('Output exists; choose a new file')
        with zipfile.ZipFile(file) as archive, zipfile.ZipFile(output, 'w') as target:
            for item in archive.infolist():
                target.writestr(item, changed.get(item.filename, archive.read(item.filename)), compress_type=zipfile.ZIP_DEFLATED)
        # The same wording, objects and order, or nothing is published.
        before, after = content(file), content(output)
        if before != after:
            Path(output).unlink()
            raise ValueError('Settle changed content; no output written')
        result.update(output=str(output), changedParts=sorted(changed), applied=True)
    else:
        result.update(applied=False)
    return result


def content(file):
    pkg, _ = tools.load(file)
    return [[(s['kind'], s['id'], s['text']) for s in shapes(pkg.zip.read(part))] for _, _, part in tools.slides(pkg)]


def signature(data, shape):
    """What a shape looks like apart from where it is and what it says."""
    return hashlib.sha256(repr(shape['look']).encode()).hexdigest()


def changes(before_file, after_file, output=None):
    """What changed on each slide between two versions of a deck, in plain words, for a person to review."""
    before, _ = tools.load(before_file)
    after, _ = tools.load(after_file)
    old = {ident: (number, part) for number, ident, part in tools.slides(before)}
    new = [(number, ident, part) for number, ident, part in tools.slides(after)]
    rows, unchanged = [], []
    for number, ident, part in new:
        if ident not in old:
            rows.append(dict(number=number, notes=['New slide.'], counts=dict(added_slide=1)))
            continue
        was_number, was_part = old[ident]
        a_data, b_data = before.zip.read(was_part), after.zip.read(part)
        a = {s['id']: s for s in shapes(a_data)}
        b = {s['id']: s for s in shapes(b_data)}
        notes, counts = [], collections.Counter()
        if was_number != number:
            notes.append(f'Moved from position {was_number}.')
        moved, sized, reworded, restyled = [], [], [], []
        for key, s in b.items():
            o = a.get(key)
            if o is None:
                continue
            label = repr(s['text'][:32]) if s['text'] else ('picture' if s['kind'] == 'pic' else 'shape') + ' ' + key
            dx, dy, dw, dh = s['x'] - o['x'], s['y'] - o['y'], s['w'] - o['w'], s['h'] - o['h']
            if max(abs(dx), abs(dy)) > 0.2:
                moved.append((max(abs(dx), abs(dy)), label, dx, dy))
            if max(abs(dw), abs(dh)) > 0.2:
                sized.append((max(abs(dw), abs(dh)), label, dw, dh))
            if s['text'] != o['text']:
                reworded.append(label)
            if signature(a_data, o) != signature(b_data, s):
                restyled.append(label)
        added = [repr(s['text'][:32]) if s['text'] else s['kind'] + ' ' + key for key, s in b.items() if key not in a]
        removed = [repr(s['text'][:32]) if s['text'] else s['kind'] + ' ' + key for key, s in a.items() if key not in b]

        def names(entries, limit=3):
            shown = ', '.join(entries[:limit])
            return shown + (f' and {len(entries) - limit} more' if len(entries) > limit else '')
        if moved:
            moved.sort(reverse=True)
            notes.append(f"{len(moved)} moved, by up to {moved[0][0]:.1f} pt: {names([m[1] for m in moved])}.")
        if sized:
            sized.sort(reverse=True)
            notes.append(f"{len(sized)} resized, by up to {sized[0][0]:.1f} pt: {names([m[1] for m in sized])}.")
        if restyled:
            notes.append(f"{len(restyled)} restyled (fill, line, font, anchor or spacing): {names(restyled)}.")
        if reworded:
            notes.append(f"{len(reworded)} with changed wording: {names(reworded)}.")
        if added:
            notes.append(f"{len(added)} added: {names(added)}.")
        if removed:
            notes.append(f"{len(removed)} removed: {names(removed)}.")
        counts.update(moved=len(moved), resized=len(sized), restyled=len(restyled), reworded=len(reworded), added=len(added), removed=len(removed))
        if notes:
            rows.append(dict(number=number, notes=notes, counts={k: v for k, v in counts.items() if v}))
        else:
            unchanged.append(number)
    gone = sorted(number for ident, (number, _) in old.items() if ident not in {i for _, i, _ in new})
    result = dict(slides=rows, unchanged=unchanged, removedSlides=gone)
    if output:
        if Path(output).exists():
            raise ValueError('Output exists; choose a new file')
        lines = ['# What changed, slide by slide', '', '| Slide | Changes |', '| --- | --- |']
        lines += [f"| {row['number']} | " + '<br>'.join(n.replace('|', '/') for n in row['notes']) + ' |' for row in rows]
        if not rows:
            lines.append('| — | No differences found |')
        if unchanged:
            lines += ['', 'Unchanged: slides ' + ', '.join(map(str, unchanged)) + '.']
        if gone:
            lines += ['', 'Removed: former slides ' + ', '.join(map(str, gone)) + '.']
        lines += ['', 'Positions and sizes are compared in slide space; charts, tables and connectors are not compared.']
        Path(output).write_text('\n'.join(lines) + '\n', encoding='utf-8')
        result['output'] = str(output)
    return result


if __name__ == '__main__':
    try:
        action, *args = sys.argv[1:]
        if action == 'align':
            options = json.loads(args[1]) if len(args) > 1 else {}
            result = align(args[0], options.get('output'), int(options['slide']) if options.get('slide') else None)
        elif action == 'changes':
            result = changes(args[0], args[1], args[2] if len(args) > 2 else None)
        else:
            raise ValueError('Choose align or changes')
        print(json.dumps(result))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
