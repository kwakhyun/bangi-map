"""Audit appearance attributes in the exact Overture records shipped for Bangi 2."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
raw_path = ROOT / '.runtime/bangi3d/buildings-original.geojson'
selected_path = ROOT / 'data/bangi2/buildings.geojson'
raw_bytes = raw_path.read_bytes()
raw = {f['id']: f for f in json.loads(raw_bytes)['features']}
selected = json.loads(selected_path.read_text())['features']
ids = {f['properties']['id'] for f in selected}
missing = ids - raw.keys()
if missing:
    raise SystemExit(f'Original records missing: {len(missing)}')
fields = ['facade_color', 'facade_material', 'roof_material', 'roof_shape',
          'roof_direction', 'roof_orientation', 'roof_color', 'roof_height']
report = {
    'district': '서울특별시 송파구 방이2동',
    'sourceRelease': 'Overture 2026-09-23.1',
    'sourceSha256': hashlib.sha256(raw_bytes).hexdigest(),
    'selectedBuildings': len(ids),
    'matchedOriginalRecords': len(ids),
    'nonNullAppearanceAttributes': {
        field: sum(raw[ident]['properties'].get(field) is not None for ident in ids)
        for field in fields
    },
    'conclusion': '현재 확보한 원본에는 외벽 및 지붕 속성이 없으며 사진 텍스처도 없다. 외관 재현에는 별도 공급원이 필요하다.',
}
out = ROOT / 'evidence/realistic3d/building-appearance-audit.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
