#!/usr/bin/env python3
"""Keep one paragraph-properties element per paragraph in PptxGenJS slides.

PptxGenJS 4.0.1 writes an <a:pPr> before every run of a paragraph, but a DrawingML paragraph allows one, first. Text
with code is several runs, so the later ones are removed. Every other part is copied byte for byte.
"""
import json
import re
import sys
import zipfile

PARAGRAPH = re.compile(rb'<a:p>(.*?)</a:p>', re.S)
PROPERTIES = re.compile(rb'<a:pPr\b[^>]*/>|<a:pPr\b[^>]*>.*?</a:pPr>', re.S)


def one(match):
    body, seen = match.group(1), []

    def keep(found):
        seen.append(found)
        return found.group(0) if len(seen) == 1 and found.start() == 0 else b''
    return b'<a:p>' + PROPERTIES.sub(keep, body) + b'</a:p>'


source, output = sys.argv[1:]
changed = []
with zipfile.ZipFile(source) as src, open(output, 'xb') as stream, zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as dst:
    if len(src.infolist()) > 20000 or sum(i.file_size for i in src.infolist()) > 512 * 1024 * 1024:
        raise ValueError('Deck archive exceeds bounded working-copy limits')
    for info in src.infolist():
        data = src.read(info)
        if re.fullmatch(r'ppt/slides/slide\d+\.xml', info.filename):
            fixed = PARAGRAPH.sub(one, data)
            if fixed != data:
                changed.append(info.filename)
            data = fixed
        dst.writestr(info, data)
print(json.dumps({'paragraphPropertiesFixed': changed}))
