#!/usr/bin/env python3
"""Merge verified Seoul parking snapshots; never infer coordinates or live counts.
Run after import-bangi-data.py. Raw API snapshots contain only public source data.
"""
from pathlib import Path
import json, hashlib, collections, datetime
root=Path(__file__).resolve().parents[1]
raw=root/'.runtime/parking-expansion'
bounds=(127.101,37.505,127.14,37.527)
files=[raw/'city-olympic.json',raw/'city-jamsil.json',root/'.runtime/bangi-sources/parking-download.json']
def inside(lon,lat):return bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]
def number(v):
 try:return int(v) if str(v).isdigit() else None
 except (TypeError,ValueError):return None
places={p['id']:p for p in json.loads((root/'data/bangi-places.json').read_text()) if p['kind']!='PARKING'}
parking={}
for file in files[:2]:
 collected=datetime.datetime.fromtimestamp(file.stat().st_mtime,datetime.timezone.utc).isoformat()
 for r in json.loads(file.read_text())['CITYDATA']['PRK_STTS']:
  try:lon,lat=float(r['LNG']),float(r['LAT'])
  except (KeyError,ValueError,TypeError):continue
  if not inside(lon,lat):continue
  id='parking-'+r['PRK_CD']
  details=dict(type={'BS':'부설 주차장','NW':'노외 주차장','NS':'노상 주차장','NP':'주차장'}.get(r['PRK_TYPE'],'주차장'),charge='유료' if r['PAY_YN']=='Y' else '현장 확인',basicFee=number(r['RATES']),basicMinutes=number(r['TIME_RATES']),capacity=number(r['CPCTY']),coordinateNote='서울시 도시데이터 원본 좌표',accessNote='외부 차량 이용 조건과 요금 할인은 현장에서 확인해 주세요.')
  if id in parking:
   # Repeated citydata rows can omit tariff fields. Preserve previously provided values.
   parking[id]['details'].update({k:v for k,v in details.items() if v is not None})
   continue
  parking[id]=dict(id=id,kind='PARKING',name=r['PRK_NM'],address=r['ROAD_ADDR'] or r['ADDRESS'],longitude=lon,latitude=lat,sourceId=r['PRK_CD'],sourceUrl='https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do',sourceName='서울시 실시간 도시데이터 주차장 목록',sourceDate='자료별 기준일 미제공',collectedAt=collected,details=details)
groups=collections.defaultdict(list)
for r in json.loads(files[2].read_text())['DATA']:
 if r.get('lat') and r.get('lot'):groups[str(r['pklt_cd'])].append(r)
for code,rows in groups.items():
 matches=[r for r in rows if inside(float(r['lot']),float(r['lat']))]
 if not matches:continue
 r=matches[0];id='parking-'+code
 parking[id]=dict(id=id,kind='PARKING',name=r['pklt_nm'],address=r['addr'],longitude=float(r['lot']),latitude=float(r['lat']),sourceId=code,sourceUrl='https://data.seoul.go.kr/dataList/OA-13122/S/1/datasetView.do',sourceName='서울시 공영주차장 안내 정보',sourceDate=r['last_data_sync_tm'] or '자료별 기준일 미제공',collectedAt=datetime.datetime.fromtimestamp(files[2].stat().st_mtime,datetime.timezone.utc).isoformat(),details=dict(type=r['pklt_knd_nm'],charge=r['chgd_free_nm'],basicFee=number(r['prk_crg']),basicMinutes=number(r['prk_hm']),weekdayHours=r['wd_oper_bgng_tm']+'–'+r['wd_oper_end_tm'],phone=r['telno'],capacity=number(r['tpkct']) if len(rows)==1 else None,coordinateNote='노상 주차구획의 대표 좌표' if len(rows)>1 else '원본 좌표'))
places.update(parking)
all_places=sorted(places.values(),key=lambda p:p['id'])
(root/'data/bangi-places.json').write_text(json.dumps(all_places,ensure_ascii=False,indent=2)+'\n')
def sql(v):return "'"+str(v).replace("'","''")+"'"
lines=['-- Official parking coordinates, deduplicated by provider code. No live counts in migrations.']
for p in sorted(parking.values(),key=lambda p:p['id']):
 vals=[p[k] for k in ['id','kind','name','address']]
 tail=[p[k] for k in ['sourceId','sourceUrl','sourceName','sourceDate','collectedAt']]+[json.dumps(p['details'],ensure_ascii=False)]
 lines.append('INSERT INTO bangi_places(id,kind,name,address,location,source_id,source_url,source_name,source_date,collected_at,details) VALUES('+','.join(map(sql,vals))+',ST_SetSRID(ST_MakePoint('+str(p['longitude'])+','+str(p['latitude'])+'),4326),'+','.join(map(sql,tail))+') ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,location=excluded.location,source_url=excluded.source_url,source_name=excluded.source_name,source_date=excluded.source_date,collected_at=excluded.collected_at,details=excluded.details;')
sql_text='\n'.join(lines)+'\n';migration=root/'services/api/src/main/resources/db/migration/V7__bangi_parking_expansion.sql'
if migration.exists() and migration.read_text()!=sql_text:
 (raw/'parking-candidate.sql').write_text(sql_text)
 print('V7 preserved. Review parking-candidate.sql and use a NEW migration.')
else:migration.write_text(sql_text)
manifest=json.loads((root/'data/manifest.json').read_text())
manifest.update(bounds=bounds,counts=dict(collections.Counter(p['kind'] for p in all_places)),parkingSourceHashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files},parkingScopeNote='Parking extends west to 127.101. Bike and toilet snapshot bounds remain unchanged.')
(root/'data/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'counts':manifest['counts'],'parking':len(parking)},ensure_ascii=False))
