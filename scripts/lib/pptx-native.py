#!/usr/bin/env python3
"""Write composed slides directly into a copy of a native template.

Usage: pptx-native.py emit TEMPLATE.pptx PLAN.json OUTPUT.pptx

Each slide becomes an instance of one template layout. The title goes into the
layout's title placeholder, shape text lives inside its shape, edges become
connectors attached to their shapes, and recorded groups become native groups.
The template's own sample slides are removed; its masters, layouts, theme and
media are copied byte for byte.
"""
import hashlib
import importlib.util
import json
import posixpath
import re
import sys
import zipfile
import os
from xml.sax.saxutils import escape, quoteattr as _quoteattr

EMU = 12700
NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CT = 'application/vnd.openxmlformats-officedocument.presentationml'
HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
PRESETS = {'rect', 'ellipse', 'roundRect', 'diamond', 'hexagon', 'chevron', 'can'}
# Connection-site index for each side, for presets whose site order is known.
SITES = {
    'rect': {'top': 0, 'left': 1, 'bottom': 2, 'right': 3},
    'roundRect': {'top': 0, 'left': 1, 'bottom': 2, 'right': 3},
    'diamond': {'top': 0, 'left': 1, 'bottom': 2, 'right': 3},
    'ellipse': {'top': 0, 'left': 2, 'bottom': 4, 'right': 6},
}
IMAGE_TYPES = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif'}


def TAG(name):
    """Match one element written either self-closed or as an empty pair."""
    return rf'<{name}\b[^>]*?(?:/>|>\s*</{name}>)'


TREE = ('<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>'
        '<a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>')


def emu(points):
    return int(round(points * EMU))


def clean(value):
    # XML 1.0 forbids most control characters; drop them rather than write a broken part.
    return re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', value)


def text(value):
    return escape(clean(value))


def quoteattr(value):
    return _quoteattr(clean(value))


def image_type(data):
    """File extension from the image's own header, so a mislabelled file still gets the right content type."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if data[:3] == b'\xff\xd8\xff':
        return 'jpeg'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif'
    return None


def xfrm(e, flip=''):
    return (f'<a:xfrm{flip}><a:off x="{emu(e["x"])}" y="{emu(e["y"])}"/>'
            f'<a:ext cx="{emu(e["width"])}" cy="{emu(e["height"])}"/></a:xfrm>')


def fill(value):
    return f'<a:solidFill><a:srgbClr val="{value.lstrip("#").upper()}"/></a:solidFill>' if value else '<a:noFill/>'


def paragraphs(e, font):
    align = {'left': 'l', 'center': 'ctr', 'right': 'r'}[e.get('align', 'left')]
    run = (f'<a:rPr lang="en-US" sz="{int(round(e["fontSize"] * 100))}" b="{1 if e.get("bold") else 0}" dirty="0">'
           f'{fill(e["color"])}<a:latin typeface={quoteattr(font)}/><a:cs typeface={quoteattr(font)}/></a:rPr>')
    props = (f'<a:pPr marL="0" indent="0" algn="{align}"><a:lnSpc><a:spcPct val="125000"/></a:lnSpc>'
             '<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>')
    return ''.join(f'<a:p>{props}<a:r>{run}<a:t>{text(line)}</a:t></a:r></a:p>' for line in e['text'].split('\n'))


def body(e, font, inset, anchor):
    pad = emu(inset)
    return (f'<p:txBody><a:bodyPr wrap="square" lIns="{pad}" tIns="{pad}" rIns="{pad}" bIns="{pad}" anchor="{anchor}">'
            f'<a:noAutofit/></a:bodyPr><a:lstStyle/>{paragraphs(e, font)}</p:txBody>')


def non_visual(tag, number, name, extra='', inner='', descr=''):
    alt = f' descr={quoteattr(descr)}' if descr else ''
    return (f'<p:nv{tag}Pr><p:cNvPr id="{number}" name={quoteattr(name)}{alt}/>'
            f'<p:cNv{tag}Pr{extra}>{inner}</p:cNv{tag}Pr><p:nvPr/></p:nv{tag}Pr>')


class IconLibrary:
    """The brand's icon deck and index, opened once per emit and checked against its recorded hash."""

    def __init__(self, path, index):
        location = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pptx_tools.py')
        spec = importlib.util.spec_from_file_location('harness_pptx_tools', location)
        self.tools = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.tools)
        with open(index, encoding='utf-8') as stream:
            listing = json.load(stream)
        self.package, data = self.tools.load(path)
        if hashlib.sha256(data).hexdigest() != listing['sourceSha256']:
            raise ValueError('Icon source changed; rebuild the index')
        self.entries = {entry['id']: entry for entry in listing['entries']}

    def group(self, ident):
        entry = self.entries.get(ident)
        if entry is None:
            raise ValueError(f'unknown icon {ident}')
        return entry, self.tools.native_group(self.package, entry)


class Slide:
    def __init__(self, spec, plan, title_type, library=None):
        self.spec, self.plan, self.title_type, self.library = spec, plan, title_type, library
        self.numbers, self.next = {}, 2
        self.rels, self.media = [], {}
        self.report = {'id': spec['id'], 'titlePlaceholder': False, 'attached': [], 'unattached': [], 'groups': [], 'icons': []}
        self.elements = {e['id']: e for e in spec['elements']}
        for e in spec['elements']:
            self.number(e['id'])

    def number(self, key):
        if key not in self.numbers:
            self.numbers[key] = self.next
            self.next += 1
        return self.numbers[key]

    def relate(self, kind, target):
        self.rels.append((f'rId{len(self.rels) + 1}', kind, target))
        return self.rels[-1][0]

    def title(self, e):
        if not self.title_type:
            return self.textbox(e)
        self.report['titlePlaceholder'] = True
        lines = ''.join(f'<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>{text(line)}</a:t></a:r></a:p>' for line in e['text'].split('\n'))
        return (f'<p:sp><p:nvSpPr><p:cNvPr id="{self.numbers[e["id"]]}" name={quoteattr(e["id"])}/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
                f'<p:nvPr><p:ph type="{self.title_type}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{lines}</p:txBody></p:sp>')

    def textbox(self, e):
        names = non_visual('Sp', self.numbers[e['id']], e['id'], ' txBox="1"')
        return (f'<p:sp>{names}<p:spPr>{xfrm(e)}'
                f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{fill(e.get("fill"))}</p:spPr>{body(e, self.plan["font"], 3.6, "t")}</p:sp>')

    def shape(self, e):
        preset = e.get('shape', 'rect')
        if preset not in PRESETS:
            raise ValueError(f'{e["id"]}: unsupported shape {preset}')
        # Rectangles pad text by the brand inset; other presets already confine text to an inner area.
        inset = self.plan.get('shapeInset', 3.6) if preset in ('rect', 'roundRect') else 3.6
        inner = body(e, self.plan['font'], inset, 'ctr') if e.get('text') else ''
        # A chevron's point depth follows its shorter side by default; pin it to a fifth of the width so text has room.
        guides = ''
        if preset == 'chevron':
            depth = int(round(20000 * e['width'] / min(e['width'], e['height'])))
            guides = f'<a:gd name="adj" fmla="val {depth}"/>'
        return (f'<p:sp>{non_visual("Sp", self.numbers[e["id"]], e["id"])}<p:spPr>{xfrm(e)}<a:prstGeom prst="{preset}"><a:avLst>{guides}</a:avLst></a:prstGeom>'
                f'{fill(e.get("fill"))}<a:ln><a:noFill/></a:ln></p:spPr>{inner}</p:sp>')

    def side(self, target, point):
        """Which side of the target shape a line end touches, if any."""
        edges = {'left': (target['x'], None), 'right': (target['x'] + target['width'], None),
                 'top': (None, target['y']), 'bottom': (None, target['y'] + target['height'])}
        for name, (x, y) in edges.items():
            on_x = x is not None and abs(point[0] - x) <= 1 and target['y'] - 1 <= point[1] <= target['y'] + target['height'] + 1
            on_y = y is not None and abs(point[1] - y) <= 1 and target['x'] - 1 <= point[0] <= target['x'] + target['width'] + 1
            if on_x or on_y:
                return name
        return None

    def line(self, e):
        # The compiler pads a flat line to one point; a connector is exactly flat.
        width = 0 if e['width'] <= 1 < e['height'] else e['width']
        height = 0 if e['height'] <= 1 < e['width'] else e['height']
        flat = dict(e, width=width, height=height)
        start = (e['x'] + (width if e.get('flipH') else 0), e['y'] + (height if e.get('flipV') else 0))
        end = (e['x'] + (0 if e.get('flipH') else width), e['y'] + (0 if e.get('flipV') else height))
        link, joined = self.plan_connectors.get(e['id']), ''
        if link:
            for tag, node, point in (('stCxn', link['from'], start), ('endCxn', link['to'], end)):
                target = self.elements.get(node)
                site = None
                if target and target['type'] == 'shape':
                    site = SITES.get(target.get('shape', 'rect'), {}).get(self.side(target, point))
                if site is None:
                    joined = ''
                    break
                joined += f'<a:{tag} id="{self.numbers[node]}" idx="{site}"/>'
            self.report['attached' if joined else 'unattached'].append(e['id'])
        flip = (' flipH="1"' if e.get('flipH') else '') + (' flipV="1"' if e.get('flipV') else '')
        arrow = '<a:tailEnd type="triangle"/>' if e.get('arrow') else ''
        return (f'<p:cxnSp>{non_visual("CxnSp", self.numbers[e["id"]], e["id"], inner=joined)}<p:spPr>{xfrm(flat, flip)}'
                f'<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:ln w="{emu(e.get("weight", 2))}">'
                f'{fill(e.get("color", "#000000"))}{arrow}</a:ln></p:spPr></p:cxnSp>')

    def picture(self, e):
        with open(e['path'], 'rb') as stream:
            data = stream.read()
        extension = image_type(data)
        if not extension:
            raise ValueError(f'{e["id"]}: use a PNG, JPEG or GIF image')
        name = f'harness-{hashlib.sha256(data).hexdigest()[:16]}.{extension}'
        self.media[name] = data
        rel = self.relate(f'{REL}/image', f'../media/{name}')
        box, crop = dict(e), ''
        ratio, slot = e['pixelWidth'] / e['pixelHeight'], e['width'] / e['height']
        if e.get('fit', 'contain') == 'contain':
            if ratio > slot:
                box['height'] = e['width'] / ratio
                box['y'] = e['y'] + (e['height'] - box['height']) / 2
            else:
                box['width'] = e['height'] * ratio
                box['x'] = e['x'] + (e['width'] - box['width']) / 2
        elif ratio > slot:
            trim = int(round((1 - slot / ratio) / 2 * 100000))
            crop = f'<a:srcRect l="{trim}" r="{trim}"/>'
        else:
            trim = int(round((1 - ratio / slot) / 2 * 100000))
            crop = f'<a:srcRect t="{trim}" b="{trim}"/>'
        locks = '<a:picLocks noChangeAspect="1"/>'
        return (f'<p:pic>{non_visual("Pic", self.numbers[e["id"]], e["id"], inner=locks, descr=e["alt"])}'
                f'<p:blipFill><a:blip r:embed="{rel}"/>{crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>'
                f'<p:spPr>{xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')

    def icon(self, e):
        """Native library geometry as one group, fitted inside its slot without changing its proportions."""
        if self.library is None:
            raise ValueError(f'{e["id"]}: the plan names no icon library')
        entry, group = self.library.group(e['icon'])
        tools, ratio = self.library.tools, entry['bounds'][2] / entry['bounds'][3]
        width = e['width'] if ratio >= 1 else e['height'] * ratio
        height = width / ratio
        frame = group.find('p:grpSpPr/a:xfrm', tools.NS)
        frame.find('a:off', tools.NS).attrib.update(x=str(emu(e['x'] + (e['width'] - width) / 2)), y=str(emu(e['y'] + (e['height'] - height) / 2)))
        frame.find('a:ext', tools.NS).attrib.update(cx=str(emu(width)), cy=str(emu(height)))
        remap = {}
        for index, node in enumerate(group.iter('{' + tools.NS['p'] + '}cNvPr')):
            fresh = self.numbers[e['id']] if index == 0 else self.number(f'{e["id"]}#{index}')
            remap[node.get('id')] = str(fresh)
            node.set('id', str(fresh))
            if index == 0:
                node.set('name', e['id'])
            else:
                node.set('name', f'{e["id"]}_part{index}')
        for node in group.iter():
            if node.tag in ('{' + tools.NS['a'] + '}stCxn', '{' + tools.NS['a'] + '}endCxn'):
                if node.get('id') not in remap:
                    raise ValueError(f'{e["id"]}: icon connector points outside the icon')
                node.set('id', remap[node.get('id')])
        self.report['icons'].append({'id': e['id'], 'icon': e['icon'], 'label': entry['label']})
        return tools.E.tostring(group, encoding='unicode')

    def element(self, e):
        if e['type'] == 'text':
            return self.title(e) if e.get('role') == 'title' else self.textbox(e)
        if e['type'] == 'shape':
            return self.shape(e)
        if e['type'] == 'line':
            return self.line(e)
        if e['type'] == 'image':
            return self.picture(e)
        if e['type'] == 'icon':
            return self.icon(e)
        raise ValueError(f'{e["id"]}: the native emitter does not write {e["type"]} objects yet; use pptx render')

    def grouped(self):
        """Return the slide's drawing order as a tree: element IDs and (group, children) pairs."""
        order = [e['id'] for e in self.spec['elements']]
        groups = sorted(self.spec.get('groups', []), key=lambda g: len(g['members']))
        tree = list(order)
        for group in groups:
            members = set(group['members'])
            if len(members) < 2 or not members <= set(order):
                raise ValueError(f'{group["id"]}: a group needs two or more elements of its slide')
            if group['id'] in self.elements:
                raise ValueError(f'group ID {group["id"]} repeats an element ID')
            if any(self.elements[m].get('role') == 'title' for m in members):
                raise ValueError(f'{group["id"]}: the title cannot be grouped; it belongs to the layout placeholder')

            def covered(node):
                return node in members if isinstance(node, str) else set(flatten(node)) <= members

            picked = [node for node in tree if covered(node)]
            if set(flatten(picked)) != members:
                raise ValueError(f'{group["id"]}: groups may nest but not partly overlap')
            position = tree.index(picked[0])
            if tree[position:position + len(picked)] != picked:
                raise ValueError(f'{group["id"]}: members must be consecutive in drawing order, or grouping would restack them')
            tree = [node for node in tree if not covered(node)]
            tree.insert(position, (group['id'], picked))
        return tree

    def draw(self, node):
        if isinstance(node, str):
            return self.draw_element(node)
        name, children = node
        boxes = [self.elements[i] for i in flatten(children)]
        left, top = min(b['x'] for b in boxes), min(b['y'] for b in boxes)
        right, bottom = max(b['x'] + b['width'] for b in boxes), max(b['y'] + b['height'] for b in boxes)
        frame = f'x="{emu(left)}" y="{emu(top)}"', f'cx="{emu(right - left)}" cy="{emu(bottom - top)}"'
        self.report['groups'].append(name)
        return (f'<p:grpSp>{non_visual("GrpSp", self.number(name), name)}<p:grpSpPr><a:xfrm><a:off {frame[0]}/><a:ext {frame[1]}/>'
                f'<a:chOff {frame[0]}/><a:chExt {frame[1]}/></a:xfrm></p:grpSpPr>{"".join(self.draw(child) for child in children)}</p:grpSp>')

    def draw_element(self, key):
        return self.element(self.elements[key])

    def xml(self):
        self.plan_connectors = {c['id']: c for c in self.spec.get('connectors', [])}
        shapes = ''.join(self.draw(node) for node in self.grouped())
        return (f'{HEAD}<p:sld {NS}><p:cSld><p:spTree>{TREE}{shapes}</p:spTree></p:cSld>'
                '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')


def flatten(nodes):
    for node in nodes if isinstance(nodes, list) else [nodes]:
        if isinstance(node, str):
            yield node
        else:
            yield from flatten(node[1])


def notes_xml(value):
    lines = ''.join(f'<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>{text(line)}</a:t></a:r></a:p>' for line in value.split('\n'))
    return (f'{HEAD}<p:notes {NS}><p:cSld><p:spTree>{TREE}'
            '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>'
            '<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
            '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f'<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>{lines}</p:txBody></p:sp>'
            '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>')


def rels_xml(items):
    rows = ''.join(f'<Relationship Id="{i}" Type="{kind}" Target={quoteattr(target)}/>' for i, kind, target in items)
    return f'{HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rows}</Relationships>'


def rels_path(part):
    folder, name = posixpath.split(part)
    return posixpath.join(folder, '_rels', name + '.rels')


def reachable(parts):
    """Every part reachable from the package root through internal relationships."""
    seen, queue = set(), ['']
    while queue:
        part = queue.pop()
        rels = rels_path(part) if part else '_rels/.rels'
        if rels not in parts:
            continue
        seen.add(rels)
        for tag in re.findall(TAG('Relationship'), parts[rels].decode('utf-8')):
            target = re.search(r'Target="([^"]*)"', tag)
            if not target or 'TargetMode="External"' in tag:
                continue
            path = target.group(1)
            path = path[1:] if path.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part), path))
            if path in parts and path not in seen:
                seen.add(path)
                queue.append(path)
    return seen


def emit(template, plan_path, output):
    with open(plan_path, encoding='utf-8') as stream:
        plan = json.load(stream)
    with zipfile.ZipFile(template) as source:
        parts = {i.filename: source.read(i) for i in source.infolist() if not i.is_dir()}
    layout = plan['layoutPart']
    if layout not in parts:
        raise ValueError(f'Template has no {layout}')
    presentation = parts['ppt/presentation.xml'].decode('utf-8')
    for stale in ('p14:sectionLst', 'p:custShowLst'):
        presentation = re.sub(rf'<{stale}\b.*?</{stale}>', '', presentation, flags=re.S)
    pres_rels = parts['ppt/_rels/presentation.xml.rels'].decode('utf-8')
    pres_rels = re.sub(TAG('Relationship'), lambda m: '' if re.search(r'Type="[^"]*/relationships/slide"', m.group(0)) else m.group(0), pres_rels)
    used = {int(n) for n in re.findall(r'Id="rId(\d+)"', pres_rels)}
    for name in [n for n in parts if re.match(r'ppt/slides/(_rels/)?slide\d+\.xml', n)]:
        del parts[name]

    found = re.search(r'<p:ph\b[^>]*type="(title|ctrTitle)"', parts[layout].decode('utf-8'))
    title_type = found.group(1) if found else None
    notes_master = next((n for n in sorted(parts) if re.fullmatch(r'ppt/notesMasters/notesMaster\d+\.xml', n)), None)
    ids, new_rels, overrides, report = [], [], [], []
    library = IconLibrary(plan['iconLibrary']['path'], plan['iconLibrary']['index']) if plan.get('iconLibrary') else None
    for index, spec in enumerate(plan['slides'], 1):
        slide = Slide(spec, plan, title_type, library)
        slide.relate(f'{REL}/slideLayout', posixpath.relpath(layout, 'ppt/slides'))
        xml = slide.xml()
        # A name no template uses, so nothing left in the template can point at a new slide by accident.
        part = f'ppt/slides/harnessSlide{index}.xml'
        if spec.get('notes'):
            if not notes_master:
                raise ValueError('Template has no notes master; remove the notes or use a template that has one')
            notes = f'ppt/notesSlides/harnessNotes{index}.xml'
            parts[notes] = notes_xml(spec['notes']).encode('utf-8')
            parts[rels_path(notes)] = rels_xml([('rId1', f'{REL}/notesMaster', posixpath.relpath(notes_master, 'ppt/notesSlides')),
                                                ('rId2', f'{REL}/slide', f'../slides/harnessSlide{index}.xml')]).encode('utf-8')
            slide.relate(f'{REL}/notesSlide', f'../notesSlides/harnessNotes{index}.xml')
            overrides.append((notes, f'{CT}.notesSlide+xml'))
        parts[part] = xml.encode('utf-8')
        parts[rels_path(part)] = rels_xml(slide.rels).encode('utf-8')
        for name, data in slide.media.items():
            parts[f'ppt/media/{name}'] = data
        number = max(used | {0}) + 1
        used.add(number)
        ids.append(f'<p:sldId id="{255 + index}" r:id="rId{number}"/>')
        new_rels.append(f'<Relationship Id="rId{number}" Type="{REL}/slide" Target="slides/harnessSlide{index}.xml"/>')
        overrides.append((part, f'{CT}.slide+xml'))
        report.append(slide.report)

    listing = f'<p:sldIdLst>{"".join(ids)}</p:sldIdLst>'
    if re.search(r'<p:sldIdLst\b', presentation):
        presentation = re.sub(r'<p:sldIdLst\s*/>|<p:sldIdLst\b.*?</p:sldIdLst>', listing, presentation, count=1, flags=re.S)
    else:
        presentation = presentation.replace('<p:sldSz', listing + '<p:sldSz', 1)
    parts['ppt/presentation.xml'] = presentation.encode('utf-8')
    parts['ppt/_rels/presentation.xml.rels'] = pres_rels.replace('</Relationships>', ''.join(new_rels) + '</Relationships>').encode('utf-8')

    keep = reachable(parts) | {'[Content_Types].xml'}
    removed = sorted(n for n in parts if n not in keep)
    for name in removed:
        del parts[name]
    # Relationships that now point at a dropped part would make a strict reader reject the package.
    for name in [n for n in parts if n.endswith('.rels')]:
        owner = posixpath.dirname(posixpath.dirname(name))

        def alive(match):
            tag = match.group(0)
            target = re.search(r'Target="([^"]*)"', tag)
            if not target or 'TargetMode="External"' in tag:
                return tag
            path = target.group(1)
            path = path[1:] if path.startswith('/') else posixpath.normpath(posixpath.join(owner, path))
            return tag if path in parts else ''

        parts[name] = re.sub(TAG('Relationship'), alive, parts[name].decode('utf-8')).encode('utf-8')

    def declared(match):
        name = re.search(r'PartName="/([^"]*)"', match.group(0))
        return match.group(0) if not name or name.group(1) in parts else ''

    types = re.sub(TAG('Override'), declared, parts['[Content_Types].xml'].decode('utf-8'))
    # A template file (.potx) declares itself a template; the output is a presentation.
    types = types.replace(f'{CT}.template.main+xml', f'{CT}.presentation.main+xml')
    extensions = {n.rsplit('.', 1)[-1].lower() for n in parts if n.startswith('ppt/media/harness-')}
    defaults = ''.join(f'<Default Extension="{x}" ContentType="{IMAGE_TYPES[x]}"/>' for x in sorted(extensions)
                       if not re.search(rf'<Default\b[^>]*Extension="{x}"', types, flags=re.I))
    added = ''.join(f'<Override PartName="/{name}" ContentType="{kind}"/>' for name, kind in overrides)
    parts['[Content_Types].xml'] = types.replace('</Types>', defaults + added + '</Types>').encode('utf-8')

    with open(output, 'xb') as stream:
        try:
            with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as target:
                for name in ['[Content_Types].xml'] + sorted(n for n in parts if n != '[Content_Types].xml'):
                    target.writestr(name, parts[name])
        except BaseException:
            os.unlink(output)
            raise
    return {'output': output, 'slides': len(report), 'layoutPart': layout, 'titlePlaceholder': title_type,
            'removedTemplateParts': len(removed), 'report': report}


if __name__ == '__main__':
    if len(sys.argv) != 5 or sys.argv[1] != 'emit':
        raise SystemExit(__doc__)
    try:
        print(json.dumps(emit(*sys.argv[2:])))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(f'{type(error).__name__}: {error}')
