#!/usr/bin/env python3
"""Reproducible Bangi-2 cutout. Run with .tools/gis-venv/bin/python.
Inputs are pinned Overture 2026-09-23.1 and SGIS-derived admdongkor 2026-07-01.
Never synthesizes missing footprints or silently invents building heights.
"""
import json, hashlib, math
from pathlib import Path
from collections import Counter
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform
from pyproj import Transformer
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'.runtime/bangi3d'; OUT=ROOT/'data/bangi2'
def read(p): return json.loads(p.read_text())
def dump(p,v): p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':'))+'\n')
def sql(v): return "'"+str(v).replace("'","''")+"'"
def compact(v): return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def finite(v): return isinstance(v,(float,int)) and math.isfinite(v) and v>0
boundary=read(OUT/'boundary.geojson')['features'][0]
region=shape(boundary['geometry']); assert region.is_valid
metric=Transformer.from_crs(4326,5179,always_xy=True).transform
buildings=[]
for f in read(RAW/'buildings-original.geojson')['features']:
 g=shape(f['geometry']); p=f['properties']; identifier=f.get('id') or p['id']
 if p.get('is_underground') or not region.covers(g.representative_point()): continue
 assert g.is_valid and not g.is_empty,identifier
 height=p.get('height'); floors=p.get('num_floors'); origin='SOURCE' if finite(height) else 'FLOORS' if finite(floors) else 'UNKNOWN'
 h=round(height,2) if origin=='SOURCE' else round(floors*3.3,2) if origin=='FLOORS' else None
 assert h is None or 0<h<850
 center=g.representative_point()
 sources=[{k:s.get(k) for k in ['dataset','record_id','update_time','license','provider','resource','version']} for s in p.get('sources',[])]
 props={'id':identifier,'name':(p.get('names') or {}).get('primary'),'height':height if finite(height) else None,'floors':floors if finite(floors) else None,'renderHeight':h,'heightKind':origin,'class':p.get('class'),'subtype':p.get('subtype'),'areaM2':round(transform(metric,g).area,1),'longitude':center.x,'latitude':center.y,'sources':sources}
 buildings.append({'type':'Feature','id':identifier,'properties':props,'geometry':f['geometry']})
buildings.sort(key=lambda f:f['id']); assert len({f['id'] for f in buildings})==len(buildings)
roads=[]
for f in read(RAW/'roads-original.geojson')['features']:
 p=f['properties'];g=shape(f['geometry'])
 if p.get('subtype')!='road': continue
 # Include a small geographic context margin; never fabricate road paths.
 if not region.buffer(.0005).intersects(g):continue
 roads.append({'type':'Feature','id':f.get('id') or p['id'],'geometry':f['geometry'],'properties':{'class':p.get('class'),'name':(p.get('names') or {}).get('primary')}})
counts=Counter(f['properties']['heightKind'] for f in buildings)
inside=[]
for p in read(ROOT/'data/bangi-places.json'):
 if region.covers(Point(p['longitude'],p['latitude'])): inside.append(p)
cent=region.centroid
manifest={'version':'bangi2-20261011-v1','district':'방이2동','admCode':'1171056200','boundaryVersion':'2026-07-01','buildingRelease':'2026-09-23.1','areaM2':round(transform(metric,region).area),'bounds':list(region.bounds),'center':{'longitude':cent.x,'latitude':cent.y},'buildings':len(buildings),'heightCounts':dict(counts),'roads':len(roads),'placeCounts':dict(Counter(p['kind'] for p in inside)),'placeIds':sorted(p['id'] for p in inside),'collectedAt':'2026-10-11','groundModel':'WGS84 ellipsoid; no surveyed terrain','heightPolicy':'SOURCE: original map attribute, not survey-verified; FLOORS: floors × 3.3m estimate; UNKNOWN: footprint only','selectionPolicy':'building representative point covered by district; facility point covered by district','sourceHashes':{name:hashlib.sha256((RAW/name).read_bytes()).hexdigest() for name in ['buildings-original.geojson','roads-original.geojson']}}
scene={'type':'BangiDistrictScene','metadata':manifest,'boundary':boundary,'buildings':{'type':'FeatureCollection','features':buildings},'roads':{'type':'FeatureCollection','features':roads}}
dump(OUT/'buildings.geojson',scene['buildings']);dump(OUT/'roads.geojson',scene['roads']);dump(OUT/'manifest.json',manifest)
dump(ROOT/'apps/web/public/gis/bangi2-scene-v1.json',scene)
# Additive migration; subsequent dataset versions must use a new migration.
lines=['-- SGIS-derived district and Overture building snapshot. See data/bangi2/SOURCES.md.',
'''CREATE TABLE bangi_districts (id text PRIMARY KEY, name text NOT NULL, boundary geometry(MultiPolygon,4326) NOT NULL, metadata jsonb NOT NULL, CHECK(ST_IsValid(boundary)));\nCREATE INDEX bangi_districts_boundary_gix ON bangi_districts USING gist(boundary);\nCREATE TABLE bangi_buildings (id text PRIMARY KEY, name text, footprint geometry(MultiPolygon,4326) NOT NULL, properties jsonb NOT NULL, CHECK(ST_IsValid(footprint)));\nCREATE INDEX bangi_buildings_footprint_gix ON bangi_buildings USING gist(footprint);''',
"INSERT INTO bangi_districts VALUES('bangi2','방이2동',ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON("+sql(compact(boundary['geometry']))+"),4326)),"+sql(compact(manifest))+"::jsonb);"]
for f in buildings:
 p=f['properties'];lines.append('INSERT INTO bangi_buildings VALUES('+','.join([sql(f['id']),sql(p['name']) if p['name'] else 'NULL','ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('+sql(compact(f['geometry']))+'),4326))',sql(compact(p))+'::jsonb'])+');')
lines.append("DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='fieldtwin_staging_api') THEN GRANT SELECT ON bangi_districts,bangi_buildings TO fieldtwin_staging_api; END IF; END $$;")
path=ROOT/'services/api/src/main/resources/db/migration/V8__bangi2_gis.sql';out='\n'.join(lines)+'\n'
if path.exists() and path.read_text()!=out: raise SystemExit('Migration exists with different content. Create a new migration instead.')
path.write_text(out)
print(json.dumps(manifest,ensure_ascii=False,indent=2));print('scene bytes',len(compact(scene).encode()))
