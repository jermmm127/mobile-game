#!/usr/bin/env python3
"""Generate weapon models with Meshy AI and import them into the game.

    MESHY_API_KEY=... python3 tools/meshy_generate.py <weapon-id> [<weapon-id> ...]   (or: all)

For each weapon in tools/meshy_prompts.json: text-to-3D preview -> refine (textured) -> download the .glb
to assets/meshy/<id>.glb -> tools/import_model.py (shrinks textures, embeds it). Placement (scale, grip,
sights, muzzle, magazine box) still has to be added to src/imported.js after looking at the model.
Needs network access to api.meshy.ai and assets.meshy.ai. Uses Meshy credits.
"""
import json, os, subprocess, sys, time, urllib.request

API = 'https://api.meshy.ai/openapi/v2/text-to-3d'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def call(method, url, body=None):
    key = os.environ.get('MESHY_API_KEY')
    if not key: sys.exit('MESHY_API_KEY is not set (add it to the environment, then start a new session)')
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b'{}')


def wait(task_id, label):
    while True:
        t = call('GET', API + '/' + task_id)
        st = t.get('status'); print(f'  {label}: {st} {t.get("progress", "")}%', flush=True)
        if st == 'SUCCEEDED': return t
        if st in ('FAILED', 'CANCELED', 'EXPIRED'): sys.exit(f'{label} {st}: {t.get("task_error")}')
        time.sleep(10)


def generate(wid, spec):
    print(f'{wid}: preview')
    pv = call('POST', API, {'mode': 'preview', 'prompt': spec['prompt'], 'art_style': 'realistic', 'should_remesh': True, 'topology': 'triangle', 'target_polycount': spec.get('polys', 12000)})
    pid = pv.get('result') or pv.get('id'); wait(pid, 'preview')
    print(f'{wid}: refine (textures)')
    rf = call('POST', API, {'mode': 'refine', 'preview_task_id': pid, 'enable_pbr': True})
    t = wait(rf.get('result') or rf.get('id'), 'refine')
    url = (t.get('model_urls') or {}).get('glb'); assert url, 'no glb in the result'
    os.makedirs(os.path.join(ROOT, 'assets', 'meshy'), exist_ok=True)
    out = os.path.join(ROOT, 'assets', 'meshy', wid + '.glb')
    urllib.request.urlretrieve(url, out)
    print(f'{wid}: downloaded {os.path.getsize(out) / 1e6:.1f} MB')
    subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'import_model.py'), out, wid])


def main():
    prompts = json.load(open(os.path.join(ROOT, 'tools', 'meshy_prompts.json')))
    ids = [k for k in prompts if not k.startswith('_')] if sys.argv[1:] == ['all'] else sys.argv[1:]
    if not ids: print(__doc__); sys.exit(1)
    for wid in ids:
        if wid not in prompts: sys.exit('no prompt for ' + wid)
        generate(wid, prompts[wid])


if __name__ == '__main__':
    main()
