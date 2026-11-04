#!/usr/bin/env python3
"""Import a .glb model into the game.

    python3 tools/import_model.py <model.glb> <weapon-id> [--tex 1024]

* Shrinks every texture to --tex px (JPEG; normal maps stay JPEG at high quality) and drops the
  emissive + metallic/roughness maps (the game lights weapons with its own shiny materials), so a
  20 MB AI/Sketchfab export becomes ~1-2 MB.
* Writes assets/models/<weapon-id>.glb (the optimized model) and src/assets/model-<weapon-id>.js,
  which embeds it as base64 (BR.MODEL_DATA[id]) so it works from index.html, play.html, the
  single-file build and the artifact with no extra requests.
* How the model is placed (scale, rotation, grip / sight / muzzle points, magazine split) lives
  in BR.IMPORTED in src/imported.js.
"""
import base64, io, json, os, struct, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, ln = struct.unpack('<4sII', d[:12])
    assert magic == b'glTF' and ver == 2, 'not a glTF 2 .glb file'
    off, js, binc = 12, None, b''
    while off < ln:
        cl, ct = struct.unpack('<I4s', d[off:off + 8]); chunk = d[off + 8:off + 8 + cl]
        if ct == b'JSON': js = json.loads(chunk)
        elif ct == b'BIN\x00': binc = chunk
        off += 8 + cl
    return js, binc


def write_glb(js, binc):
    jb = json.dumps(js, separators=(',', ':')).encode()
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    binc += b'\x00' * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binc)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(binc), b'BIN\x00') + binc


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    tex = int(sys.argv[sys.argv.index('--tex') + 1]) if '--tex' in sys.argv else 1024
    if len(args) < 2: print(__doc__); sys.exit(1)
    src, wid = args[0], args[1]
    if '--tex' in sys.argv: args = args[:2]
    js, binc = read_glb(src)
    bvs = js['bufferViews']
    # which textures does each material keep?
    keep_tex = set()
    for m in js.get('materials', []):
        m.pop('emissiveTexture', None); m['emissiveFactor'] = [0, 0, 0]
        pbr = m.setdefault('pbrMetallicRoughness', {})
        pbr.pop('metallicRoughnessTexture', None); pbr['metallicFactor'] = 0.35; pbr['roughnessFactor'] = 0.55
        for key in ('normalTexture', 'occlusionTexture'):
            if key in m: keep_tex.add(m[key]['index'])
        if 'baseColorTexture' in pbr: keep_tex.add(pbr['baseColorTexture']['index'])
        m.pop('occlusionTexture', None)
        keep_tex.discard(None)
    normal_tex = {m['normalTexture']['index'] for m in js.get('materials', []) if 'normalTexture' in m}
    keep_tex = {t for t in keep_tex if any(t == m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index') or t == m.get('normalTexture', {}).get('index') for m in js['materials'])}
    # re-encode the kept images, rebuild the binary buffer
    old_textures, old_images = js.get('textures', []), js.get('images', [])
    tex_map, img_map, new_textures, new_images = {}, {}, [], []
    image_blobs = {}
    for ti in sorted(keep_tex):
        t = old_textures[ti]; si = t['source']
        if si not in img_map:
            im = old_images[si]; bv = bvs[im['bufferView']]
            raw = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
            pic = Image.open(io.BytesIO(raw)).convert('RGB')
            if max(pic.size) > tex: pic = pic.resize((tex, tex) if pic.size[0] == pic.size[1] else (tex, int(pic.size[1] * tex / pic.size[0])), Image.LANCZOS)
            out = io.BytesIO(); pic.save(out, 'JPEG', quality=92 if ti in normal_tex else 85, optimize=True)
            img_map[si] = len(new_images); image_blobs[img_map[si]] = out.getvalue()
            new_images.append({'mimeType': 'image/jpeg', 'name': im.get('name', 'img%d' % si)})
        tex_map[ti] = len(new_textures); nt = dict(t); nt['source'] = img_map[si]; new_textures.append(nt)
    for m in js.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr: pbr['baseColorTexture']['index'] = tex_map[pbr['baseColorTexture']['index']]
        if 'normalTexture' in m: m['normalTexture']['index'] = tex_map[m['normalTexture']['index']]
    image_bvs = {im['bufferView'] for im in old_images}
    new_bin, new_bvs, bv_map = b'', [], {}
    for i, bv in enumerate(bvs):
        if i in image_bvs: continue
        data = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        new_bin += b'\x00' * ((4 - len(new_bin) % 4) % 4)
        nb = dict(bv); nb['byteOffset'] = len(new_bin); nb['buffer'] = 0
        bv_map[i] = len(new_bvs); new_bvs.append(nb); new_bin += data
    for ii, im in enumerate(new_images):
        new_bin += b'\x00' * ((4 - len(new_bin) % 4) % 4)
        im['bufferView'] = len(new_bvs); new_bvs.append({'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(image_blobs[ii])}); new_bin += image_blobs[ii]
    for a in js.get('accessors', []):
        if 'bufferView' in a: a['bufferView'] = bv_map[a['bufferView']]
    js['bufferViews'] = new_bvs; js['images'] = new_images; js['textures'] = new_textures
    js['buffers'] = [{'byteLength': len(new_bin)}]
    if not new_textures: js.pop('textures'); js.pop('images'); js.pop('samplers', None)
    out = write_glb(js, new_bin)
    os.makedirs(os.path.join(ROOT, 'assets', 'models'), exist_ok=True); os.makedirs(os.path.join(ROOT, 'src', 'assets'), exist_ok=True)
    open(os.path.join(ROOT, 'assets', 'models', wid + '.glb'), 'wb').write(out)
    b64 = base64.b64encode(out).decode()
    open(os.path.join(ROOT, 'src', 'assets', 'model-%s.js' % wid), 'w').write(
        "'use strict';\n// Imported 3D model for '%s' (generated by tools/import_model.py from %s). Do not edit by hand.\n"
        "(BR.MODEL_DATA = BR.MODEL_DATA || {})[%s] = '%s';\n" % (wid, os.path.basename(src), json.dumps(wid), b64))
    tris = sum(js['accessors'][p['indices']]['count'] // 3 for m in js['meshes'] for p in m['primitives'] if 'indices' in p)
    print('%s: %.1f MB -> %.2f MB glb (%d triangles, %d textures)' % (wid, os.path.getsize(src) / 1e6, len(out) / 1e6, tris, len(new_textures)))


if __name__ == '__main__':
    main()
