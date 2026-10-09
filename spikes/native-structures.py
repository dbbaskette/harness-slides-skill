#!/usr/bin/env python3
"""Spike: add a native group, an attached connector and a custom-geometry icon to slide 1 of a PPTX.

Usage: python3 spikes/native-structures.py INPUT.pptx OUTPUT.pptx
The result is imported into Google Slides by hand to see which structures survive.
"""
import sys, zipfile

EMU = 12700  # EMU per point


def shape(sid, name, x, y, w, h, text):
    return f'''<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{x*EMU}" y="{y*EMU}"/><a:ext cx="{w*EMU}" cy="{h*EMU}"/></a:xfrm>
<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2867B2"/></a:solidFill></p:spPr>
<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1800">
<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp>'''


def connector(sid, start, end, x, y, w):
    # Connection site 3 is the right edge and 1 the left edge of a rectangle-family shape.
    return f'''<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{sid}" name="spike_connector"/>
<p:cNvCxnSpPr><a:stCxn id="{start}" idx="3"/><a:endCxn id="{end}" idx="1"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>
<p:spPr><a:xfrm><a:off x="{x*EMU}" y="{y*EMU}"/><a:ext cx="{w*EMU}" cy="0"/></a:xfrm>
<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>
<a:ln w="25400"><a:solidFill><a:srgbClr val="202124"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>'''


def group(sid, x, y, w, h, children):
    box = f'<a:off x="{x*EMU}" y="{y*EMU}"/><a:ext cx="{w*EMU}" cy="{h*EMU}"/>'
    child = f'<a:chOff x="{x*EMU}" y="{y*EMU}"/><a:chExt cx="{w*EMU}" cy="{h*EMU}"/>'
    return f'''<p:grpSp><p:nvGrpSpPr><p:cNvPr id="{sid}" name="spike_group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm>{box}{child}</a:xfrm></p:grpSpPr>{children}</p:grpSp>'''


def icon(sid, x, y, size):
    # A custom-geometry diamond stands in for a library icon: same OOXML mechanism (a:custGeom).
    return f'''<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="spike_icon"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="{x*EMU}" y="{y*EMU}"/><a:ext cx="{size*EMU}" cy="{size*EMU}"/></a:xfrm>
<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>
<a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="50" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="50"/></a:lnTo>
<a:lnTo><a:pt x="50" y="100"/></a:lnTo><a:lnTo><a:pt x="0" y="50"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom>
<a:solidFill><a:srgbClr val="0091DA"/></a:solidFill></p:spPr></p:sp>'''


def main(source, target):
    part = 'ppt/slides/slide1.xml'
    with zipfile.ZipFile(source) as zin:
        xml = zin.read(part).decode('utf-8')
        if '</p:spTree>' not in xml:
            raise SystemExit('slide1.xml has no shape tree')
        left = shape(9001, 'spike_left', 120, 380, 200, 70, 'Grouped A')
        right = shape(9002, 'spike_right', 440, 380, 200, 70, 'Grouped B')
        link = connector(9003, 9001, 9002, 320, 415, 120)
        added = group(9000, 120, 380, 520, 70, left + right + link) + icon(9004, 720, 385, 60)
        xml = xml.replace('</p:spTree>', added + '</p:spTree>')
        with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                zout.writestr(item, xml.encode('utf-8') if item.filename == part else zin.read(item.filename))
    print(f'wrote {target}: group 9000 (shapes 9001, 9002, connector 9003), icon 9004')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
