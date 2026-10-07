"""Read-only PPTX structural audit. Standard library only; never renders or extracts files."""
import hashlib
import io
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'
RID = '{' + NS['r'] + '}id'
EMU = 914400
MAX_BYTES = 128 * 1024 * 1024
MAX_XML = 8 * 1024 * 1024
CHROME = {'ftr', 'hdr', 'dt', 'sldNum'}
PLACEHOLDER = re.compile(r'click to (?:add|edit)|lorem ipsum|\{\{[^{}]+\}\}', re.I)


class Package:
    def __init__(self, data):
        self.zip = zipfile.ZipFile(io.BytesIO(data))
        entries = self.zip.infolist()
        if len(entries) > 10000 or sum(x.file_size for x in entries) > 256 * 1024 * 1024:
            raise ValueError('PPTX exceeds package inspection limits')
        self.names = set()
        for item in entries:
            name = item.filename
            if name in self.names or name.startswith('/') or '\\' in name or '..' in name.split('/'):
                raise ValueError('Duplicate or unsafe package member')
            self.names.add(name)
        self.cache = {}

    def xml(self, name):
        if name not in self.cache:
            if name not in self.names:
                raise ValueError('Missing package part: ' + name)
            if self.zip.getinfo(name).file_size > MAX_XML:
                raise ValueError('XML part exceeds inspection limit: ' + name)
            data = self.zip.read(name)
            # Reject declarations even in UTF-16 before passing to ElementTree.
            probe = data.replace(b'\x00', b'').upper()
            if b'<!DOCTYPE' in probe or b'<!ENTITY' in probe:
                raise ValueError('DTD/entity declarations are not supported')
            self.cache[name] = ET.fromstring(data)
        return self.cache[name]

    def rels(self, part):
        name = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
        if name not in self.names:
            return {}
        result = {}
        for rel in self.xml(name).findall(REL):
            rid = rel.get('Id')
            if not rid or rid in result:
                raise ValueError('Invalid relationship IDs in ' + name)
            target = rel.get('Target', '')
            external = rel.get('TargetMode') == 'External'
            if not external:
                target = posixpath.normpath(posixpath.join(posixpath.dirname(part), target)) if not target.startswith('/') else target[1:]
                if target.startswith('../') or '\\' in target or not target:
                    raise ValueError('Unsafe relationship target')
            result[rid] = (target, external, rel.get('Type', '').rsplit('/', 1)[-1])
        return result

    def related(self, part, kind):
        matches = [t for t, external, k in self.rels(part).values() if k == kind and not external]
        return self.xml(matches[0]) if matches else None

    def related_path(self, part, kind):
        return next((t for t, external, k in self.rels(part).values() if k == kind and not external), None)

