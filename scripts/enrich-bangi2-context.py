"""Add real Overture park/school polygons without rewriting deployed DB migrations."""
from pathlib import Path
import json, hashlib
from shapely.geometry import shape, mapping
root = Path(__file__).resolve().parents[1]
source = root / '.runtime/bangi3d/land-original.geojson'
region = shape(json.loads((root / 'data/bangi2/boundary.geojson').read_text())['features'][0]['geometry'])
features = []
for f in json.loads(source.read_text())['features']:
    p = f['properties']
    if p.get('class') not in ('park', 'school'): continue
    clipped = shape(f['geometry']).intersection(region)
    if clipped.is_empty or clipped.geom_type not in ('Polygon', 'MultiPolygon'): continue
    assert clipped.is_valid
    features.append({'type': 'Feature', 'geometry': mapping(clipped), 'properties': {
        'id': f['id'], 'name': (p.get('names') or {}).get('primary'),
        'class': p['class'], 'sources': p.get('sources', [])
    }})
land = {'type': 'FeatureCollection', 'features': features}
compact = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':')) + '\n'
(root / 'data/bangi2/land.geojson').write_text(compact(land))
scene_path = root / 'apps/web/public/gis/bangi2-scene-v1.json'
scene = json.loads(scene_path.read_text()); scene['land'] = land
scene_path.write_text(compact(scene))
(root / 'data/bangi2/land-source.json').write_text(json.dumps({
    'release': '2026-09-23.1', 'source': 's3://overturemaps-us-west-2/release/2026-09-23.1/theme=base/type=land_use/',
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'license': 'ODbL-1.0',
    'processing': 'park/school polygons intersected with Bangi 2-dong boundary', 'features': len(features)
}, ensure_ascii=False, indent=2) + '\n')
print({'landFeatures': len(features), 'names': [f['properties']['name'] for f in features]})
