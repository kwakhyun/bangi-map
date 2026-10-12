"""Reproduce the full footprint audit; never infer streamed 3D coverage from footprints."""
import csv
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
scene_path = ROOT / 'apps/web/public/gis/bangi2-scene-v1.json'
scene = json.loads(scene_path.read_text())
buildings = scene['buildings']['features']
boundary = shape(scene['boundary']['geometry'])
raw_path = ROOT / '.runtime/bangi3d/buildings-original.geojson'
raw = {f['id']: f for f in json.loads(raw_path.read_text())['features']}
ids = [f['properties']['id'] for f in buildings]
assert len(set(ids)) == len(ids), 'Duplicate building ID'
assert set(ids) <= raw.keys(), 'Missing original records'
rows, groups = [], {}
for f in buildings:
    p = f['properties']; geom = shape(f['geometry'])
    assert geom.is_valid and not geom.is_empty and boundary.covers(geom.representative_point())
    assert geom.equals_exact(shape(raw[p['id']]['geometry']), 0)
    original = raw[p['id']]['properties']
    dates = []
    providers = []
    for s in p['sources']:
        provider = s.get('provider') or s.get('dataset') or 'unknown'
        providers.append(provider)
        group = groups.setdefault(provider, {'buildings': 0, 'updateTimes': []})
        group['buildings'] += 1
        if s.get('update_time'):
            dates.append(s['update_time']); group['updateTimes'].append(s['update_time'])
    rows.append({
        'building_id': p['id'], 'longitude': p['longitude'], 'latitude': p['latitude'],
        'footprint_provider': '|'.join(providers), 'footprint_release': scene['metadata']['buildingRelease'],
        'source_update_time': '|'.join(sorted(set(dates))), 'height_status': p['heightKind'],
        'vworld_model_id': '', 'photoreal_status': 'UNVERIFIED', 'capture_date': '',
        'reason': 'No building-level model inventory or capture-date metadata obtained',
    })
for group in groups.values():
    dates = group.pop('updateTimes')
    group['minSourceUpdateTime'] = min(dates) if dates else None
    group['maxSourceUpdateTime'] = max(dates) if dates else None
appearance = ['facade_color', 'facade_material', 'roof_material', 'roof_shape', 'roof_direction', 'roof_orientation', 'roof_color', 'roof_height']
report = {
    'schemaVersion': 1, 'checkedAt': datetime.now(timezone.utc).isoformat(),
    'district': '방이2동', 'scope': 'Shipped Overture footprint inventory; not a census of current buildings',
    'footprints': {'count': len(rows), 'uniqueIds': len(set(ids)), 'validGeometries': len(rows),
        'matchedSourceGeometries': len(rows), 'release': scene['metadata']['buildingRelease'],
        'sourceGroups': groups, 'heightCounts': dict(Counter(r['height_status'] for r in rows)),
        'appearanceAttributeCounts': {k: sum(raw[i]['properties'].get(k) is not None for i in ids) for k in appearance}},
    'photoreal': {'status': 'UNVERIFIED', 'missingCount': None, 'completeCount': None,
        'buildingLevelAuditCompleted': False, 'unverifiedFootprintCount': len(rows), 'knownCaptureDateCount': 0,
        'reason': 'Provider model inventory and building-level capture dates unavailable in inspected public metadata. Visual samples do not establish completeness.'},
    'vworld': {'regionalBuildYear': 2024, 'region': '서울 전역', 'regionalAreaKm2': 605,
        'captureDate': None, 'catalogServiceUpdatedAt': '2022-08-16',
        'dateCaveat': 'Regional build-year table and legacy service-update field disagree; neither establishes each rendered model capture date.',
        'metadataUrl': 'https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?svcCde=DT&dsId=DAT_0000000000000125'},
    'smap': {'latestSelectableYearObserved': 2025, 'bangi2VisualSampleConfirmed': True,
        'captureDate': None, 'rawDataAcquired': False, 'rawDataRequiresApplication': True,
        'freeViewerUrl': 'https://smap.seoul.go.kr/#MjA5ODU3LjE3NDQ1Mzg3OTQ3LDU0NjMzMS4zMDg1Nzg5NjM1LDAsMC43ODUzOTgxNjMzOTc0NDgzLDMwMA==&encode=y&3D',
        'faqUrl': 'https://openlab.eseoul.go.kr/', 'faqRevision': '2026-04',
        'note': '2025 is the selected map layer year, not a verified per-building capture date. Raw model reuse is subject to supplier review; fee not established.'},
    'hashes': {'sceneSha256': hashlib.sha256(scene_path.read_bytes()).hexdigest(), 'originalSha256': hashlib.sha256(raw_path.read_bytes()).hexdigest()},
}
out = ROOT/'evidence/realistic3d'; out.mkdir(exist_ok=True)
public = ROOT/'apps/web/public/gis'
for folder in (out, public):
    (folder/'coverage-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    with (folder/'building-coverage-audit.csv').open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
print(json.dumps(report, ensure_ascii=False, indent=2))
