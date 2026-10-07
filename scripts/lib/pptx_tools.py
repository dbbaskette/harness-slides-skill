"""Portable PPTX inventory and native icon reuse. Python standard library only."""
import copy
import hashlib
import importlib.util
import io
import json
import math
import re
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as E
from pathlib import Path

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('presentation_audit', Path(__file__).with_name('pptx-package.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
NS, RID = audit.NS, audit.RID
for prefix in ('p', 'a', 'r', 'c'):
    E.register_namespace(prefix, NS[prefix])
RELNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
EMU = 914400


def load(file):
    if Path(file).stat().st_size > audit.MAX_BYTES:
        raise ValueError('PPTX exceeds inspection limit')
    data = Path(file).read_bytes()
    return audit.Package(data), data


def xml_bytes(root):
    # ElementTree removes unused namespace declarations; ignore lists cannot retain them.
    for node in root.iter():
        node.attrib.pop('{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable', None)
    return E.tostring(root, encoding='utf-8', xml_declaration=True)


def slides(pkg):
    presentation = pkg.xml('ppt/presentation.xml')
    rels = pkg.rels('ppt/presentation.xml')
    result = []
    for index, item in enumerate(presentation.findall('p:sldIdLst/p:sldId', NS), 1):
        part, external, kind = rels[item.get(RID)]
        if external or kind != 'slide':
            raise ValueError('Invalid slide relationship')
        result.append((index, item.get('id'), part))
    return result


def inventory(file):
    pkg, data = load(file)
    pages = slides(pkg)
    size = pkg.xml('ppt/presentation.xml').find('p:sldSz', NS).attrib
    result = []
    for index, ident, part in pages:
        seen = set()
        def visit(name):
            if name in seen:
                return
            if name not in pkg.names:
                raise ValueError('Missing related part: ' + name)
            seen.add(name)
            # Notes are preserved in the deck but do not change rendered appearance.
            for target, external, kind in pkg.rels(name).values():
                if not external and kind not in ('notesSlide', 'slide'):
                    visit(target)
        visit(part)
        # Some PowerPoint templates inherit their only theme from the presentation,
        # rather than a master. Default text styles and embedded fonts also live here.
        for target, external, kind in pkg.rels('ppt/presentation.xml').values():
            if not external and kind in ('theme', 'tableStyles', 'font', 'fontData', 'presProps'):
                visit(target)
        h = hashlib.sha256(json.dumps([index, len(pages), size], sort_keys=True).encode())
        h.update(pkg.zip.read('ppt/presentation.xml'))
        for name in sorted(seen):
            h.update(name.encode())
            h.update(pkg.zip.read(name))
            relpath = posixpath.join(posixpath.dirname(name), '_rels', posixpath.basename(name) + '.rels')
            if relpath in pkg.names:
                h.update(pkg.zip.read(relpath))
        root = pkg.xml(part)
        texts = [' '.join((t.text or '') for t in s.findall('.//a:t', NS)).strip()
                 for s in root.findall('p:cSld/p:spTree/p:sp', NS)]
        result.append(dict(number=index, id=ident, part=part,
                           hidden=root.get('show', '1') in ('0', 'false'),
                           title=next((t for t in texts if t), ''), fingerprint=h.hexdigest()))
    return dict(sha256=hashlib.sha256(data).hexdigest(), size=dict(width=int(size['cx']), height=int(size['cy'])), slides=result)


def box(shape):
    for route in ('p:spPr/a:xfrm', 'p:grpSpPr/a:xfrm', 'p:xfrm'):
        x = shape.find(route, NS)
        if x is not None:
            off, ext = x.find('a:off', NS), x.find('a:ext', NS)
            if off is not None and ext is not None:
                return tuple(int(v) for v in (off.get('x'), off.get('y'), ext.get('cx'), ext.get('cy')))
    return None


def shape_id(shape):
    item = shape.find('.//p:cNvPr', NS)
    return item.get('id') if item is not None else None


def icon_index(file, catalog):
    pkg, data = load(file)
    digest = hashlib.sha256(data).hexdigest()
    if digest != catalog['source']['sha256']:
        raise ValueError('Icon source does not match the approved catalog')
    entries = []
    for page in catalog['catalogPages']:
        tree = pkg.xml(f"ppt/slides/slide{page['slide']}.xml").find('p:cSld/p:spTree', NS)
        labels = []
        for frame in tree.findall('p:graphicFrame', NS):
            tbl, origin = frame.find('.//a:tbl', NS), box(frame)
            if tbl is None or origin is None:
                continue
            widths = [int(c.get('w')) for c in tbl.findall('a:tblGrid/a:gridCol', NS)]
            y = origin[1]
            for row in tbl.findall('a:tr', NS):
                x = origin[0]
                for cell, width in zip(row.findall('a:tc', NS), widths):
                    label = ' '.join((t.text or '').strip() for t in cell.findall('.//a:t', NS)).strip()
                    if label:
                        labels.append((label, x, y, width))
                    x += width
                y += int(row.get('h'))
        if [v[0] for v in labels] != page['labels']:
            raise ValueError('Catalog label order differs from source')
        for ordinal, (label, x, y, width) in enumerate(labels, 1):
            previous_y = max([ly for _, lx, ly, lw in labels if ly < y and abs(lx - x) < width / 2] or [0])
            selected = []
            for shape in tree:
                b = box(shape)
                if shape.tag.rsplit('}', 1)[-1] not in ('sp', 'grpSp', 'pic') or not b:
                    continue
                if any((t.text or '').strip() for t in shape.findall('.//a:t', NS)):
                    continue
                sx, sy, sw, sh = b
                if sw > width * 1.1 or sh > y - previous_y:
                    continue
                if x <= sx + sw / 2 < x + width and previous_y < sy + sh / 2 < y:
                    selected.append((shape, b))
            ident = f"fi-{digest[:8]}-s{page['slide']:03d}-l{ordinal:03d}"
            bounds = None
            if selected:
                left = min(b[0] for _, b in selected)
                top = min(b[1] for _, b in selected)
                right = max(b[0] + b[2] for _, b in selected)
                bottom = max(b[1] + b[3] for _, b in selected)
                bounds = [left, top, right - left, bottom - top]
            entries.append(dict(id=ident, slide=page['slide'], labelIndex=ordinal, label=label,
                                shapeIds=[shape_id(s) for s, _ in selected], bounds=bounds,
                                native=bool(selected) and not any(s.findall('.//p:pic', NS) or s.tag.endswith('}pic') for s, _ in selected),
                                preview=f'references/icon-previews/{ident}.png' if selected else None))
    return dict(schemaVersion=1, sourceSha256=digest, entries=entries)


def native_group(pkg, entry):
    part = f"ppt/slides/slide{entry['slide']}.xml"
    tree = pkg.xml(part).find('p:cSld/p:spTree', NS)
    shapes = [copy.deepcopy(s) for s in tree if shape_id(s) in entry['shapeIds']]
    if not shapes or len(shapes) != len(entry['shapeIds']):
        raise ValueError('Mapped icon shapes are missing')
    # Native copy supports self-contained geometry. Relationships require a fuller importer.
    if not entry['native'] or any(k.startswith('{' + NS['r'] + '}') for s in shapes for node in s.iter() for k in node.attrib):
        raise ValueError('This icon contains image/relationship content; choose a native alternative or copy it in the editor')
    group = E.Element('{' + NS['p'] + '}grpSp')
    nv = E.SubElement(group, '{' + NS['p'] + '}nvGrpSpPr')
    E.SubElement(nv, '{' + NS['p'] + '}cNvPr', id='1', name=entry['id'], descr=entry['label'])
    E.SubElement(nv, '{' + NS['p'] + '}cNvGrpSpPr')
    E.SubElement(nv, '{' + NS['p'] + '}nvPr')
    props = E.SubElement(group, '{' + NS['p'] + '}grpSpPr')
    xfrm = E.SubElement(props, '{' + NS['a'] + '}xfrm')
    x, y, w, h = entry['bounds']
    for tag, attrs in [('off', dict(x='0', y='0')), ('ext', dict(cx=str(w), cy=str(h))),
                       ('chOff', dict(x=str(x), y=str(y))), ('chExt', dict(cx=str(w), cy=str(h)))]:
        E.SubElement(xfrm, '{' + NS['a'] + '}' + tag, **attrs)
    for shape in shapes:
        for parent in shape.iter():
            for child in list(parent):
                if child.tag == '{' + NS['p'] + '}txBody' and not any((t.text or '').strip() for t in child.findall('.//a:t', NS)):
                    parent.remove(child)
        group.append(shape)
    # Resolve source theme colors so target-theme changes do not recolor copied geometry.
    layout = pkg.related_path(part, 'slideLayout')
    master = pkg.related_path(layout, 'slideMaster')
    theme_path = pkg.related_path(master, 'theme')
    theme = pkg.xml(theme_path).find('a:themeElements/a:clrScheme', NS)
    colors = {node.tag.rsplit('}', 1)[-1]: (list(node)[0].get('lastClr') or list(node)[0].get('val')) for node in theme}
    master_map = pkg.xml(master).find('p:clrMap', NS).attrib
    mapping = dict(master_map)
    for name in [layout, part]:
        override = pkg.xml(name).find('p:clrMapOvr/a:overrideClrMapping', NS)
        if override is not None:
            mapping = dict(override.attrib)
        elif pkg.xml(name).find('p:clrMapOvr/a:masterClrMapping', NS) is not None:
            mapping = dict(master_map)
    resolved = {key: colors[value] for key, value in mapping.items()}
    colors.update(resolved)
    for node in group.iter('{' + NS['a'] + '}schemeClr'):
        value = colors.get(node.get('val'))
        if not value or len(value) != 6:
            raise ValueError('Unresolved icon theme color')
        node.tag = '{' + NS['a'] + '}srgbClr'
        node.set('val', value)
    return group


def write_new(output, files):
    if Path(output).suffix.lower() != '.pptx':
        raise ValueError('Output must end in .pptx')
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, value in sorted(files.items()):
            z.writestr(name, value)
    with open(output, 'xb') as handle:
        handle.write(stream.getvalue())


def icon_previews(archive, index, ids, output):
    pkg, data = load(archive)
    if hashlib.sha256(data).hexdigest() != index['previewArchive']['sha256']:
        raise ValueError('Icon preview bundle changed; reinstall the verified package')
    result = {}
    for ident in ids:
        entry = next((e for e in index['entries'] if e['id'] == ident), None)
        if entry is None or entry['preview'] != f'references/icon-previews/{ident}.png':
            raise ValueError('Unknown icon preview')
        info = pkg.zip.getinfo(entry['preview'])
        if info.file_size > 512 * 1024:
            raise ValueError('Icon preview exceeds size limit')
        image = pkg.zip.read(entry['preview'])
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Invalid icon preview PNG')
        path = Path(output) / f'{ident}.png'
        with open(path, 'xb') as handle:
            handle.write(image)
        result[ident] = str(path)
    return result



def brand_previews(archive, sha256, entries, output):
    pkg, data = load(archive)
    if hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError('Brand preview bundle changed; reinstall the verified package')
    if not 1 <= len(entries) <= 20 or len({e['preview'] for e in entries}) != len(entries):
        raise ValueError('Select 1–20 unique preview paths')
    result = {}
    for entry in entries:
        name = entry['preview']
        if not re.fullmatch(r'references/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.png', name):
            raise ValueError('Unknown template preview path')
        info = pkg.zip.getinfo(name)
        if info.file_size > 2 * 1024 * 1024:
            raise ValueError('Brand preview exceeds size limit')
        image = pkg.zip.read(name)
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Invalid brand preview PNG')
        path = Path(output) / Path(name).name
        with path.open('xb') as handle:
            handle.write(image)
        result[name] = str(path)
    return result


def copy_icon(source, index, ident, output, target=None, slide=1, x=0, y=0, width=1.2):
    pkg, data = load(source)
    if hashlib.sha256(data).hexdigest() != index['sourceSha256']:
        raise ValueError('Icon source changed; rebuild the index')
    entry = next((e for e in index['entries'] if e['id'] == ident), None)
    if entry is None:
        raise ValueError('Unknown stable icon ID')
    if not all(math.isfinite(v) and v >= 0 for v in [x, y, width]) or width == 0:
        raise ValueError('Use nonnegative finite coordinates and a positive width in inches')
    group = native_group(pkg, entry)
    w, h = int(width * EMU), round(width * EMU * entry['bounds'][3] / entry['bounds'][2])
    gx = group.find('p:grpSpPr/a:xfrm', NS)
    gx.find('a:off', NS).attrib.update(x=str(round(x * EMU)), y=str(round(y * EMU)))
    gx.find('a:ext', NS).attrib.update(cx=str(w), cy=str(h))
    if target:
        dest, _ = load(target)
        pages = slides(dest)
        if slide < 1 or slide > len(pages):
            raise ValueError('Target slide number is outside the deck')
        part = pages[slide - 1][2]
        root = copy.deepcopy(dest.xml(part))
        # ElementTree cannot retain arbitrary namespace prefixes used by MC Requires.
        if root.findall('.//{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent'):
            raise ValueError('Target slide uses alternate-content markup; insert the icon with a native editor')
        tree = root.find('p:cSld/p:spTree', NS)
        size = dest.xml('ppt/presentation.xml').find('p:sldSz', NS)
        if x * EMU + w > int(size.get('cx')) or y * EMU + h > int(size.get('cy')):
            raise ValueError('Icon would exceed the target slide bounds')
        next_id = max([int(n.get('id')) for n in root.findall('.//p:cNvPr', NS)] or [0]) + 1
        files = {name: dest.zip.read(name) for name in dest.names}
    else:
        part = 'ppt/slides/slide1.xml'
        root = E.Element('{' + NS['p'] + '}sld')
        c = E.SubElement(root, '{' + NS['p'] + '}cSld')
        tree = E.SubElement(c, '{' + NS['p'] + '}spTree')
        nv = E.SubElement(tree, '{' + NS['p'] + '}nvGrpSpPr')
        E.SubElement(nv, '{' + NS['p'] + '}cNvPr', id='1', name='')
        E.SubElement(nv, '{' + NS['p'] + '}cNvGrpSpPr')
        E.SubElement(nv, '{' + NS['p'] + '}nvPr')
        E.SubElement(tree, '{' + NS['p'] + '}grpSpPr')
        next_id = 2
        files = {
            '[Content_Types].xml': f'<Types xmlns="{CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/{part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'.encode(),
            '_rels/.rels': f'<Relationships xmlns="{RELNS}"><Relationship Id="rId1" Type="{NS["r"]}/officeDocument" Target="ppt/presentation.xml"/></Relationships>'.encode(),
            'ppt/presentation.xml': f'<p:presentation xmlns:p="{NS["p"]}" xmlns:r="{NS["r"]}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="{w + round(x * EMU)}" cy="{h + round(y * EMU)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'.encode(),
            'ppt/_rels/presentation.xml.rels': f'<Relationships xmlns="{RELNS}"><Relationship Id="rId1" Type="{NS["r"]}/slide" Target="slides/slide1.xml"/></Relationships>'.encode(),
        }
        # A standalone extraction has a complete blank master/layout chain so
        # native editors need not repair an otherwise renderable slide-only ZIP.
        empty_tree = E.tostring(tree, encoding='unicode')
        color_map = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        ns = f'xmlns:p="{NS["p"]}" xmlns:a="{NS["a"]}" xmlns:r="{NS["r"]}"'
        files['ppt/slideLayouts/slideLayout1.xml'] = f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Editable icon">{empty_tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'.encode()
        files['ppt/slideMasters/slideMaster1.xml'] = f'<p:sldMaster {ns}><p:cSld>{empty_tree}</p:cSld>{color_map}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'.encode()
        source_layout = pkg.related_path(f"ppt/slides/slide{entry['slide']}.xml", 'slideLayout')
        source_master = pkg.related_path(source_layout, 'slideMaster')
        files['ppt/theme/theme1.xml'] = pkg.zip.read(pkg.related_path(source_master, 'theme'))
        for name, links in [
            ('ppt/slides/_rels/slide1.xml.rels', [('slideLayout', '../slideLayouts/slideLayout1.xml')]),
            ('ppt/slideLayouts/_rels/slideLayout1.xml.rels', [('slideMaster', '../slideMasters/slideMaster1.xml')]),
            ('ppt/slideMasters/_rels/slideMaster1.xml.rels', [('slideLayout', '../slideLayouts/slideLayout1.xml'), ('theme', '../theme/theme1.xml')])]:
            items = ''.join(f'<Relationship Id="rId{i}" Type="{NS["r"]}/{kind}" Target="{path}"/>' for i, (kind, path) in enumerate(links, 1))
            files[name] = f'<Relationships xmlns="{RELNS}">{items}</Relationships>'.encode()
        for name, kind in [('ppt/slideLayouts/slideLayout1.xml', 'presentationml.slideLayout'), ('ppt/slideMasters/slideMaster1.xml', 'presentationml.slideMaster'), ('ppt/theme/theme1.xml', 'theme')]:
            override = f'<Override PartName="/{name}" ContentType="application/vnd.openxmlformats-officedocument.{kind}+xml"/>'
            files['[Content_Types].xml'] = files['[Content_Types].xml'].replace(b'</Types>', override.encode() + b'</Types>')
        files['ppt/presentation.xml'] = files['ppt/presentation.xml'].replace(b'<p:sldIdLst>', b'<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst>')
        master_rel = f'<Relationship Id="rId2" Type="{NS["r"]}/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
        files['ppt/_rels/presentation.xml.rels'] = files['ppt/_rels/presentation.xml.rels'].replace(b'</Relationships>', master_rel.encode() + b'</Relationships>')
    remap = {}
    for node in group.findall('.//p:cNvPr', NS):
        remap[node.get('id')] = str(next_id)
        node.set('id', str(next_id))
        next_id += 1
    for node in group.iter():
        if node.tag in ('{' + NS['a'] + '}stCxn', '{' + NS['a'] + '}endCxn'):
            if node.get('id') not in remap:
                raise ValueError('Icon connector points outside the selected group')
            node.set('id', remap[node.get('id')])
    tree.append(group)
    files[part] = xml_bytes(root)
    write_new(output, files)
    return dict(output=str(Path(output).resolve()), id=ident, label=entry['label'], slide=slide if target else 1,
                native=True, sourceSlide=entry['slide'], sourceSha256=index['sourceSha256'])


if __name__ == '__main__':
    try:
        action, *args = sys.argv[1:]
        if action == 'inventory':
            result = inventory(args[0])
        elif action == 'icon-index':
            result = icon_index(args[0], json.loads(Path(args[1]).read_text()))
        elif action == 'icon-copy':
            request = json.loads(args[0])
            request['index'] = json.loads(Path(request['index']).read_text())
            result = copy_icon(**request)
        elif action == 'brand-previews':
            result = brand_previews(**json.loads(args[0]))
        elif action == 'icon-previews':
            request = json.loads(args[0])
            request['index'] = json.loads(Path(request['index']).read_text())
            result = icon_previews(**request)
        else:
            raise ValueError('Unknown PPTX helper operation')
        print(json.dumps(result))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
