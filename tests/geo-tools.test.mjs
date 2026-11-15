import {test} from 'node:test';
import assert from 'node:assert/strict';
import {haversine,pathLength,ringArea,formatLength,formatArea,parseCoordinates,formatCoordinate,scaleDenominator,clusterPoints,toCsv,toGeoJson} from '../lib/geo-tools.ts';

test('distance between Tashkent and Samarkand is about 266 km',()=>{
 const d=haversine([41.3111,69.2797],[39.6542,66.9597]);
 assert.ok(d>262000&&d<270000,String(d));
 assert.equal(pathLength([[41,69]]),0);
 assert.ok(Math.abs(pathLength([[0,0],[0,1],[0,2]])-2*haversine([0,0],[0,1]))<1e-6);
});

test('polygon area matches a one-degree cell at the equator and ignores winding order',()=>{
 const ring=[[0,0],[0,1],[1,1],[1,0]],area=ringArea(ring);
 assert.ok(Math.abs(area/1e6-12364)<25,String(area/1e6));
 assert.ok(Math.abs(ringArea([...ring].reverse())-area)<1);
 assert.equal(ringArea([[0,0],[0,1]]),0);
});

test('lengths and areas use readable units per language',()=>{
 assert.equal(formatLength(850,'uz'),'850 m');
 assert.equal(formatLength(2500,'en'),'2.50 km');
 assert.equal(formatLength(2500,'uz'),'2,50 km');
 assert.equal(formatLength(265900,'ru'),'266 км');
 assert.equal(formatArea(5000,'uz'),'5 000 m²');
 assert.equal(formatArea(125000,'uz'),'12,5 ga');
 assert.equal(formatArea(125000,'en'),'12.5 ha');
 assert.equal(formatArea(44.7e9,'en'),'44,700 km²');
});

test('coordinate search accepts decimal, decimal-comma, hemisphere and DMS input',()=>{
 assert.deepEqual(parseCoordinates('41.3111, 69.2797'),{lat:41.3111,lng:69.2797});
 assert.deepEqual(parseCoordinates('41.3111,69.2797'),{lat:41.3111,lng:69.2797});
 assert.deepEqual(parseCoordinates('41,3111 69,2797'),{lat:41.3111,lng:69.2797});
 assert.deepEqual(parseCoordinates('69.2797E 41.3111N'),{lat:41.3111,lng:69.2797});
 assert.deepEqual(parseCoordinates('N41.3111 E69.2797'),{lat:41.3111,lng:69.2797});
 const dms=parseCoordinates('41°18\'40"N 69°16\'47"E');
 assert.ok(Math.abs(dms.lat-41.3111)<0.0005&&Math.abs(dms.lng-69.2797)<0.0005);
 assert.deepEqual(parseCoordinates('-33.9, 151.2'),{lat:-33.9,lng:151.2});
 assert.deepEqual(parseCoordinates('120.5, 30.2'),{lat:30.2,lng:120.5});
});

test('ordinary place names and impossible values are not treated as coordinates',()=>{
 for(const text of ['','Samarqand','Hotel 21','12','41.3','95, 200','41.3, 69.2, 5','41°70\'N 69°E','41N 42N'])assert.equal(parseCoordinates(text),null,text);
});

test('coordinates are formatted in decimal degrees and DMS without minute overflow',()=>{
 assert.equal(formatCoordinate(41.3111,69.2797),'41.31110° N, 69.27970° E');
 assert.equal(formatCoordinate(-33.9,-151.2),'33.90000° S, 151.20000° W');
 assert.equal(formatCoordinate(41.3111,69.2797,true),'41°18′40″ N, 69°16′47″ E');
 assert.equal(formatCoordinate(40.99999,69.99999,true),'41°00′00″ N, 70°00′00″ E');
});

test('scale denominator shrinks by half per zoom level and is rounded',()=>{
 const a=scaleDenominator(41,6),b=scaleDenominator(41,7);
 assert.ok(a>6e6&&a<7.5e6,String(a));
 assert.ok(Math.abs(a/b-2)<0.1);
 assert.equal(a%100000,0);
});

test('grid clustering keeps every point exactly once',()=>{
 const points=[{x:1,y:1},{x:10,y:12},{x:200,y:5},{x:65,y:65},{x:70,y:70}];
 const groups=clusterPoints(points,64);
 assert.equal(groups.length,3);
 assert.deepEqual(groups.flatMap(g=>g.items).sort(),[0,1,2,3,4]);
 const first=groups.find(g=>g.items.includes(0));
 assert.deepEqual(first.items,[0,1]);assert.equal(first.x,5.5);assert.equal(first.y,6.5);
});

test('neighbouring grid cells that would overlap are merged into one cluster',()=>{
 const groups=clusterPoints([{x:60,y:10},{x:62,y:12},{x:68,y:10},{x:300,y:300}],64);
 assert.equal(groups.length,2);
 const big=groups.find(g=>g.items.length===3);
 assert.deepEqual([...big.items].sort(),[0,1,2]);
 assert.ok(Math.abs(big.x-190/3)<1e-9);
});

test('CSV export quotes text and neutralises spreadsheet formulas',()=>{
 const csv=toCsv([{name:'Cafe "Plov", Center',lat:41.3,lng:69.2,phone:'+998 71 000'},{name:'=HYPERLINK("x")',lat:40,lng:null}],['name','lat','lng','phone']);
 const lines=csv.split('\r\n');
 assert.equal(lines[0],'name,lat,lng,phone');
 assert.equal(lines[1],'"Cafe ""Plov"", Center",41.3,69.2,\'+998 71 000');
 assert.equal(lines[2],'"\'=HYPERLINK(""x"")",40,,');
});

test('GeoJSON export writes longitude first and keeps attribution',()=>{
 const g=toGeoJson([{name:'A',category:'food',lat:41.3,lng:69.2}],'© OpenStreetMap contributors');
 assert.equal(g.type,'FeatureCollection');assert.equal(g.attribution,'© OpenStreetMap contributors');
 assert.deepEqual(g.features[0].geometry.coordinates,[69.2,41.3]);
 assert.deepEqual(g.features[0].properties,{name:'A',category:'food'});
});
