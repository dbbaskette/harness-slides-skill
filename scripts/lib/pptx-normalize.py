#!/usr/bin/env python3
"""Create a parser-compatible working copy; keep all non-BOM part bytes intact."""
import json
import re
import sys
import zipfile

source, output = sys.argv[1:]
changed = []
with zipfile.ZipFile(source) as src, open(output, 'xb') as stream, zipfile.ZipFile(stream, 'w') as dst:
    if len(src.infolist()) > 20000 or sum(i.file_size for i in src.infolist()) > 512 * 1024 * 1024:
        raise ValueError('Template archive exceeds bounded working-copy limits')
    for info in src.infolist():
        data = src.read(info)
        if info.filename.endswith(('.xml', '.rels')) and data.startswith(b'\xef\xbb\xbf'):
            data = data[3:]
            changed.append(info.filename)
        if info.filename == 'ppt/presentation.xml':
            root = re.search(rb'<(?:[A-Za-z_][\w.-]*:)?presentation\b[^>]*>', data)
            if root and b'xmlns:r=' not in root.group():
                tag = root.group()[:-1] + b' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                data = data[:root.start()] + tag + data[root.end():]
                changed.append(info.filename + ':root relationship namespace')
        dst.writestr(info, data)
print(json.dumps({'normalizedXmlParts': changed}))
