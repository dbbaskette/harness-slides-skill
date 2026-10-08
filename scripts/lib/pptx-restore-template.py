#!/usr/bin/env python3
"""Retain original root-template artwork parts after parser serialization."""
import json
import sys
import zipfile

root, composed, output = sys.argv[1:]
prefixes = ('ppt/slideMasters/', 'ppt/slideLayouts/', 'ppt/theme/', 'ppt/media/', 'ppt/notesMasters/')
with zipfile.ZipFile(root) as authority, zipfile.ZipFile(composed) as src, open(output, 'xb') as stream, zipfile.ZipFile(stream, 'w') as dst:
    originals = {i.filename: authority.read(i) for i in authority.infolist() if i.filename.startswith(prefixes)}
    if not originals.keys() <= set(src.namelist()):
        raise ValueError('Composition discarded protected root-template parts')
    for info in src.infolist():
        dst.writestr(info, originals[info.filename] if info.filename in originals else src.read(info))
print(json.dumps({'retainedNativeTemplateParts': len(originals)}))
