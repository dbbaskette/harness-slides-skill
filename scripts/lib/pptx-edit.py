"""Native OOXML inspection and guarded text/alt patches. No document rebuild."""
import copy
import hashlib
import json
import sys
import xml.etree.ElementTree as E
from pathlib import Path
import importlib.util

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('pptx_tools', Path(__file__).with_name('pptx_tools.py'))
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)
NS, EMU = tools.NS, tools.EMU


def digest(node):
    return hashlib.sha256(E.tostring(node)).hexdigest() if node is not None else None


def shape_record(shape):
    props = shape.find('.//p:cNvPr', NS)
    if props is None:
        return None
    texts = shape.findall('.//a:t', NS)
    normalized = copy.deepcopy(shape)
    for t in normalized.findall('.//a:t', NS):
        t.text = ''
    nv = normalized.find('.//p:cNvPr', NS)
    nv.attrib.pop('descr', None)
    nv.attrib.pop('title', None)
    kind = shape.tag.rsplit('}', 1)[-1]
    return dict(id=props.get('id'), name=props.get('name'), type=kind,
                text=''.join(t.text or '' for t in texts), runs=[t.text or '' for t in texts],
                alt=props.get('descr', ''), title=props.get('title', ''),
                box=tools.box(shape), structureHash=digest(normalized), contentHash=digest(shape))


def inspect(file):
    pkg, data = tools.load(file)
    result = tools.inventory(file)
    for slide in result['slides']:
        root = pkg.xml(slide['part'])
        tree = root.find('p:cSld/p:spTree', NS)
        slide['objects'] = [record for shape in tree if (record := shape_record(shape))]
        slide['notesPart'] = pkg.related_path(slide['part'], 'notesSlide')
        slide['layoutPart'] = pkg.related_path(slide['part'], 'slideLayout')
    result['parts'] = {name: hashlib.sha256(pkg.zip.read(name)).hexdigest() for name in sorted(pkg.names)}
    result['layouts'] = []
    for name in sorted(pkg.names):
        if name.startswith('ppt/slideLayouts/slideLayout') and name.endswith('.xml'):
            root = pkg.xml(name)
            result['layouts'].append(dict(part=name, name=root.find('p:cSld', NS).get('name', ''),
                                          type=root.get('type'), objects=[r for s in root.find('p:cSld/p:spTree', NS) if (r := shape_record(s))]))
    # Observed tokens are evidence, not an inferred brand policy.
    fonts, colors = set(), set()
    for name in pkg.names:
        if name.startswith('ppt/') and name.endswith('.xml'):
            root = pkg.xml(name)
            fonts.update(n.get('typeface') for n in root.findall('.//a:latin', NS) if n.get('typeface'))
            colors.update(n.get('val') for n in root.findall('.//a:srgbClr', NS) if n.get('val'))
    result['observedTokens'] = dict(fonts=sorted(fonts), colors=sorted(colors))
    return result


def compare(before, after, allowed=None):
    """A change allow-list is scoped by slide ID and native object ID."""
    allowed = allowed or []
    exceptions = {(str(x['slide']), str(x['object'])): set(x.get('fields', [])) for x in allowed}
    failures = []
    if before['size'] != after['size']:
        failures.append(dict(code='canvas-changed'))
    if [s['id'] for s in before['slides']] != [s['id'] for s in after['slides']]:
        failures.append(dict(code='slide-order-or-count-changed'))
    after_slides = {s['id']: s for s in after['slides']}
    for slide in before['slides']:
        target = after_slides.get(slide['id'])
        if target is None:
            continue
        by_id = {s['id']: s for s in target['objects']}
        if [s['id'] for s in slide['objects']] != [s['id'] for s in target['objects']]:
            failures.append(dict(slide=slide['id'], code='object-order-or-count-changed'))
        for obj in slide['objects']:
            other = by_id.get(obj['id'])
            if other is None:
                continue
            fields = exceptions.get((slide['id'], obj['id']), set())
            if obj['structureHash'] != other['structureHash'] and 'structure' not in fields:
                failures.append(dict(slide=slide['id'], object=obj['id'], code='geometry-style-or-relationships-changed'))
            for field in ('text', 'alt', 'title'):
                if obj[field] != other[field] and field not in fields:
                    failures.append(dict(slide=slide['id'], object=obj['id'], code=field+'-changed'))
    changed_parts = [part for part in set(before['parts']) | set(after['parts']) if before['parts'].get(part) != after['parts'].get(part)]
    allowed_parts = {s['part'] for s in before['slides'] if any(k[0] == s['id'] for k in exceptions)}
    for part in changed_parts:
        if part not in allowed_parts:
            failures.append(dict(part=part, code='unselected-package-part-changed'))
    return dict(preserved=not failures, failures=failures, changedParts=sorted(changed_parts))


def patch(source, request, output):
    before = inspect(source)
    if before['sha256'] != request.get('sourceSha256'):
        raise ValueError('Source changed; inspect again before patching')
    if Path(source).resolve() == Path(output).resolve():
        raise ValueError('Never patch the source in place')
    ops = request.get('operations')
    if not isinstance(ops, list) or not ops:
        raise ValueError('Provide scoped patch operations')
    pkg, data = tools.load(source)
    files = {name: pkg.zip.read(name) for name in pkg.names}
    pages = {s['id']: s for s in before['slides']}
    allowed, roots, touched = [], {}, set()
    for op in ops:
        slide = pages.get(str(op.get('slide')))
        if slide is None:
            raise ValueError('Unknown stable slide ID')
        part = slide['part']
        root = roots.setdefault(part, copy.deepcopy(pkg.xml(part)))
        shape = next((s for s in root.find('p:cSld/p:spTree', NS) if (r := shape_record(s)) and r['id'] == str(op.get('object'))), None)
        if shape is None:
            raise ValueError('Unknown top-level native object ID')
        record = shape_record(shape)
        key = (slide['id'], record['id'])
        if key in touched:
            raise ValueError('Use one operation per object')
        touched.add(key)
        if record['contentHash'] != op.get('expectedHash'):
            raise ValueError('Object changed since inspection')
        fields = []
        if 'text' in op:
            texts = shape.findall('.//a:t', NS)
            if len(texts) != 1 or not isinstance(op['text'], str):
                raise ValueError('Whole-text patch requires one text run; use explicit run edits for rich text')
            texts[0].text = op['text']
            fields.append('text')
        if 'runs' in op:
            if 'text' in op or not isinstance(op['runs'], list) or not op['runs']:
                raise ValueError('Choose whole text or explicit runs')
            texts = shape.findall('.//a:t', NS)
            indices = set()
            for run in op['runs']:
                i = run.get('index')
                if not isinstance(i, int) or i < 0 or i >= len(texts) or i in indices or not isinstance(run.get('text'), str):
                    raise ValueError('Invalid run edit')
                indices.add(i)
                texts[i].text = run['text']
            fields.append('text')
        props = shape.find('.//p:cNvPr', NS)
        for field, attr in [('alt', 'descr'), ('title', 'title')]:
            if field in op:
                if not isinstance(op[field], str):
                    raise ValueError('Alt text must be a string')
                props.set(attr, op[field])
                fields.append(field)
        if not fields:
            raise ValueError('Patch contains no supported changes')
        allowed.append(dict(slide=slide['id'], object=record['id'], fields=fields))
    for part, root in roots.items():
        files[part] = tools.xml_bytes(root)
    # Build off to the side, compare before publishing, and never overwrite output.
    import tempfile
    with tempfile.TemporaryDirectory(prefix='harness-patch-') as tmp:
        candidate = Path(tmp) / 'candidate.pptx'
        tools.write_new(candidate, files)
        after = inspect(candidate)
        report = compare(before, after, allowed)
        if not report['preserved']:
            raise ValueError('Preservation check failed: ' + json.dumps(report['failures']))
        with Path(output).open('xb') as stream:
            stream.write(candidate.read_bytes())
    return dict(output=str(Path(output).resolve()), sha256=after['sha256'], preservation=report,
                status='preservation checked; visual review required')


if __name__ == '__main__':
    try:
        action, *args = sys.argv[1:]
        if action == 'inspect':
            result = inspect(args[0])
        elif action == 'patch':
            result = patch(args[0], json.loads(Path(args[1]).read_text()), args[2])
        elif action == 'compare':
            result = compare(inspect(args[0]), inspect(args[1]), json.loads(Path(args[2]).read_text()) if len(args) > 2 else [])
        else:
            raise ValueError('Choose inspect, patch or compare')
        print(json.dumps(result))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
