import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));
const routes=read('tourism-routes.json'),photos=read('route-photos.json');

test('routes have unique ids, three languages and a day plan that fits the stated days',()=>{
 assert.ok(routes.length>=5);
 assert.equal(new Set(routes.map(r=>r.id)).size,routes.length);
 for(const r of routes){
  assert.equal(r.kind,'editorial');assert.match(r.daysStatus,/planning assumption/);
  for(const field of [r.name,r.summary,r.season,r.transport])for(const lang of ['uz','en','ru'])assert.ok(field[lang],r.id);
  assert.ok(r.stops.length>=2,r.id);assert.equal(new Set(r.stops.map(s=>s.id)).size,r.stops.length);
  const days=r.stops.map(s=>s.day);assert.deepEqual(days,[...days].sort((a,b)=>a-b),r.id+' days in order');
  assert.ok(Math.max(...days)<=r.days&&Math.min(...days)>=1,r.id);
 }
});

test('every stop lies inside Uzbekistan and states where its coordinate comes from',()=>{
 for(const r of routes)for(const s of r.stops){
  assert.ok(s.lat>37&&s.lat<45.7&&s.lng>55.9&&s.lng<73.2,r.id+'/'+s.id);
  assert.match(s.coordinateSource,/^(OpenStreetMap record|approximate)/);
  for(const lang of ['uz','en','ru']){assert.ok(s.name[lang]);assert.ok(s.note[lang]);}
 }
});

test('stop photos carry author, licence and a Wikimedia Commons source page',()=>{
 let withPhoto=0;
 for(const r of routes)for(const s of r.stops){
  if(!s.image)continue;withPhoto++;
  assert.ok(s.image.url.startsWith('/tourism/')||/^https:\/\/(thumb|upload)\.wikimedia\.org\//.test(s.image.url),s.image.url);
  assert.ok(s.image.credit.length>1,s.id);
  assert.match(s.image.license,/^(CC BY|CC0|Public domain)/);
  assert.ok(s.image.sourceUrl.startsWith('https://commons.wikimedia.org/wiki/File:'),s.id);
 }
 assert.ok(withPhoto>=20,String(withPhoto));
 for(const p of Object.values(photos))assert.ok(p.title.startsWith('File:'));
});

test('route lines start and end at the first and last stop and report how they were made',()=>{
 const km=(a,b)=>{const r=x=>x*Math.PI/180,h=Math.sin(r(b[0]-a[0])/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(r(b[1]-a[1])/2)**2;return 2*6371*Math.asin(Math.sqrt(h));};
 for(const r of routes){
  assert.ok(r.path.length>=2,r.id);
  const first=r.stops[0],last=r.stops.at(-1);
  assert.ok(km(r.path[0],[first.lat,first.lng])<0.05,r.id);assert.ok(km(r.path.at(-1),[last.lat,last.lng])<0.05,r.id);
  let line=0;for(let i=1;i<r.path.length;i++)line+=km(r.path[i-1],r.path[i]);
  let direct=0;for(let i=1;i<r.stops.length;i++)direct+=km([r.stops[i-1].lat,r.stops[i-1].lng],[r.stops[i].lat,r.stops[i].lng]);
  assert.ok(r.distanceKm>=direct-5&&r.distanceKm<2.3*direct+20,`${r.id}: ${r.distanceKm} vs direct ${direct.toFixed(0)}`);
  assert.ok(line<=r.distanceKm+10,r.id);
  assert.match(r.pathStatus,/not navigation|schematic/);
 }
});
