#!/usr/bin/env python3
"""Normalize the official Seoul snapshots. No network or API key is used here.
Download commands and source versions are recorded in data/SOURCES.md.
"""
from pathlib import Path
import json, zipfile, xml.etree.ElementTree as ET, re, hashlib, datetime, collections
root=Path(__file__).resolve().parents[1]; raw=root/'.runtime/bangi-sources'; dest=root/'data';dest.mkdir(exist_ok=True)
bounds=(127.105,37.505,127.14,37.527)
def inside(lon,lat):return bounds[0]<=float(lon)<=bounds[2] and bounds[1]<=float(lat)<=bounds[3]
def clean(v):return ', '.join(x.strip() for x in str(v or '').split('|') if x.strip())
# The source snapshot collection time is stable across regeneration.
collected=datetime.datetime.fromtimestamp((raw/'bikes.xlsx').stat().st_mtime,datetime.timezone.utc).isoformat()
places=[]
def add(kind,id,name,address,lon,lat,dataset,title,date,details):
 if not inside(lon,lat):return
 places.append(dict(id=kind.lower()+'-'+str(id),kind=kind,name=name.strip(),address=address.strip(),longitude=float(lon),latitude=float(lat),sourceId=str(id),sourceUrl='https://data.seoul.go.kr/dataList/'+dataset+'/datasetView.do',sourceName=title,sourceDate=date,collectedAt=collected,details=details))
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(raw/'bikes.xlsx') as z:
 strings=[''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml'))]
 for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row',ns):
  r={}
  for cell in row.findall('s:c',ns):
   v=cell.find('s:v',ns)
   if v is not None:r[re.sub(r'\d','',cell.attrib['r'])]=strings[int(v.text)] if cell.attrib.get('t')=='s' else v.text
  try:
   if not r.get('A','').isdigit() or not inside(r['F'],r['E']):continue
   add('BIKE',r['A'],r['B'],r['D'],r['F'],r['E'],'OA-13252/F/1','서울시 공공자전거 대여소 정보','2026-06',{'stationNumber':r['A'],'racks':sum(int(float(r.get(k,'0') or 0)) for k in ['H','I']),'method':r.get('J','')})
  except (KeyError,ValueError):continue
for r in json.loads((raw/'toilets-download.json').read_text())['DATA']:
 if not r.get('coord_x') or not r.get('coord_y'):continue
 add('TOILET',r['objectid'],r['conts_name'],r['addr_new'] or r['addr_old'],r['coord_x'],r['coord_y'],'OA-22586/S/1','서울시 공중화장실 위치정보','자료별 기준일 미제공',{'hours':clean(r['value_02']),'accessibility':clean(r['value_05']),'amenities':clean(r['value_06']),'type':clean(r['value_01']),'phone':clean(r['tel_no'])})
groups=collections.defaultdict(list)
for r in json.loads((raw/'parking-download.json').read_text())['DATA']:
 if r.get('lat') and r.get('lot'):groups[r['pklt_cd']].append(r)
for id,rows in groups.items():
 # A curbside parking lot can have one row per space. Keep one actual source coordinate,
 # and omit capacity instead of presenting a row's one-space count as the whole lot.
 matching=[r for r in rows if inside(r['lot'],r['lat'])]
 if not matching:continue
 r=matching[0]
 add('PARKING',id,r['pklt_nm'],r['addr'],r['lot'],r['lat'],'OA-13122/S/1','서울시 공영주차장 안내 정보',r['last_data_sync_tm'] or '자료별 기준일 미제공',{'type':r['pklt_knd_nm'],'charge':r['chgd_free_nm'],'basicFee':r['prk_crg'],'basicMinutes':r['prk_hm'],'weekdayHours':r['wd_oper_bgng_tm']+'–'+r['wd_oper_end_tm'],'phone':r['telno'],'capacity':r['tpkct'] if len(rows)==1 else None,'coordinateNote':'노상 주차구획의 대표 좌표' if len(rows)>1 else '원본 좌표'})
places.sort(key=lambda p:p['id'])
assert len({p['id'] for p in places})==len(places)
(dest/'bangi-places.json').write_text(json.dumps(places,ensure_ascii=False,indent=2)+'\n')
def sql(v):return "'"+str(v).replace("'","''")+"'"
lines=['-- Generated from data/bangi-places.json. Official source snapshots; no live counts.']
for p in places:
 vals=[p[k] for k in ['id','kind','name','address']]
 tail=[p[k] for k in ['sourceId','sourceUrl','sourceName','sourceDate','collectedAt']]+[json.dumps(p['details'],ensure_ascii=False)]
 lines.append('INSERT INTO bangi_places(id,kind,name,address,location,source_id,source_url,source_name,source_date,collected_at,details) VALUES('+','.join(map(sql,vals))+',ST_SetSRID(ST_MakePoint('+str(p['longitude'])+','+str(p['latitude'])+'),4326),'+','.join(map(sql,tail))+');')
migration=root/'services/api/src/main/resources/db/migration/V5__bangi_facilities.sql'
sql_text='\n'.join(lines)+'\n'
if migration.exists() and migration.read_text()!=sql_text:
 (raw/'import-candidate.sql').write_text(sql_text)
 print('V5 preserved. Review import-candidate.sql and create a NEW migration for updated data.')
else:migration.write_text(sql_text)
manifest={'collectedAt':collected,'bounds':bounds,'counts':dict(collections.Counter(p['kind'] for p in places)),'sourceHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [raw/'bikes.xlsx',raw/'toilets-download.json',raw/'parking-download.json']}}
(dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False))

# Reapply the independently versioned parking expansion when its snapshots are present.
if all((root/'.runtime/parking-expansion'/f).exists() for f in ['city-olympic.json','city-jamsil.json']):
 import runpy
 runpy.run_path(str(root/'scripts/import-parking-data.py'),run_name='__main__')
