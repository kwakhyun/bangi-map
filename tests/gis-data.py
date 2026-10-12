"""Validate shipped geography against downloaded source records (offline)."""
import json, gzip, hashlib
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
from shapely.geometry import shape
root = Path(__file__).resolve().parents[1]
scene_path = root / 'apps/web/public/gis/bangi2-scene-v1.json'
scene = json.loads(scene_path.read_text())
manifest = json.loads((root/'data/bangi2/manifest.json').read_text())
assert scene['metadata'] == manifest
boundary = shape(scene['boundary']['geometry'])
assert boundary.is_valid and not boundary.is_empty
assert scene['boundary'] == json.loads((root/'data/bangi2/boundary.geojson').read_text())['features'][0]
for name, digest in manifest['sourceHashes'].items():
    assert hashlib.sha256((root/'.runtime/bangi3d'/name).read_bytes()).hexdigest() == digest
raw = {f['id']:f for f in json.loads((root/'.runtime/bangi3d/buildings-original.geojson').read_text())['features']}
ids = set(); counts = Counter()
for feature in scene['buildings']['features']:
    p = feature['properties']; original = raw[p['id']]; source = original['properties']; geom = shape(feature['geometry'])
    assert p['id'] not in ids; ids.add(p['id'])
    assert geom.is_valid and geom.area > 0 and boundary.covers(geom.representative_point())
    assert geom.equals_exact(shape(original['geometry']), 0)
    assert p['height'] == source.get('height')
    if p['heightKind'] == 'SOURCE': assert p['renderHeight'] == p['height'] and p['height'] > 0
    elif p['heightKind'] == 'FLOORS': assert not source.get('height') and p['floors'] == source['num_floors'] and abs(p['renderHeight'] - p['floors'] * 3.3) < .01
    else: assert p['renderHeight'] is None and not source.get('height') and not source.get('num_floors')
    assert p['sources']; counts[p['heightKind']] += 1
assert counts == manifest['heightCounts'] and len(ids) == manifest['buildings']
assert len(scene['roads']['features']) == manifest['roads']
for f in scene['land']['features']:
    geom=shape(f['geometry']); assert geom.is_valid and boundary.buffer(1e-10).covers(geom)
report = {'checkedAt':datetime.now(timezone.utc).isoformat(), 'valid':True, 'buildings':len(ids), 'heightCounts':counts,
    'roads':len(scene['roads']['features']), 'landPolygons':len(scene['land']['features']), 'geometryMatchesSource':True,
    'sceneBytes':scene_path.stat().st_size, 'gzipBytes':len(gzip.compress(scene_path.read_bytes())), 'sceneSha256':hashlib.sha256(scene_path.read_bytes()).hexdigest()}
(root/'evidence/bangi2-data-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
