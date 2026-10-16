import assert from "node:assert/strict";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {districtRepresentativePoint,isPointInPolygon} from "../../lib/maps/district-geometry.mjs";

const dataDirectory=new URL("../../public/maps/districts/",import.meta.url);

async function loadCollections(){
  const directoryPath=fileURLToPath(dataDirectory);
  const files=(await readdir(directoryPath)).filter(file=>file.endsWith(".geojson")).sort();
  const collections=await Promise.all(files.map(async file=>[
    file,
    JSON.parse(await readFile(join(directoryPath,file),"utf8")),
  ]));
  return {files,collections};
}

function walkCoordinates(value,visit){
  if(!Array.isArray(value))return;
  if(value.length>=2&&typeof value[0]==="number"&&typeof value[1]==="number"){
    visit(value[0],value[1]);
    return;
  }
  for(const nested of value)walkCoordinates(nested,visit);
}

test("district GeoJSON bundle contains the 15 approved files and 159 boundaries",async()=>{
  const {files,collections}=await loadCollections();
  assert.equal(files.length,15);
  const featureCount=collections.reduce((total,[,collection])=>{
    assert.equal(collection.type,"FeatureCollection");
    assert.ok(Array.isArray(collection.features));
    return total+collection.features.length;
  },0);
  assert.equal(featureCount,159);
});

test("district GeoJSON features have unique names and valid Malaysia coordinates",async()=>{
  const {collections}=await loadCollections();
  const names=new Set();
  let coordinateCount=0;
  for(const [file,collection] of collections){
    for(const feature of collection.features){
      assert.equal(feature.type,"Feature",file);
      assert.ok(feature.properties&&typeof feature.properties.name==="string",file);
      assert.ok(feature.properties.name.trim().length>0,file);
      assert.ok(feature.properties.sourceName===undefined||typeof feature.properties.sourceName==="string",file);
      assert.ok(!names.has(feature.properties.name),`duplicate district name: ${feature.properties.name}`);
      names.add(feature.properties.name);
      assert.ok(["Polygon","MultiPolygon"].includes(feature.geometry?.type),feature.properties.name);
      walkCoordinates(feature.geometry.coordinates,(longitude,latitude)=>{
        coordinateCount++;
        assert.ok(Number.isFinite(longitude)&&longitude>=95&&longitude<=120,`${feature.properties.name}: longitude`);
        assert.ok(Number.isFinite(latitude)&&latitude>=0&&latitude<=10,`${feature.properties.name}: latitude`);
      });
    }
  }
  assert.ok(coordinateCount>0);
});

test("district data preserves the Kuala Lumpur and Tangkak source-name decisions",async()=>{
  const {collections}=await loadCollections();
  const features=collections.flatMap(([,collection])=>collection.features);
  const kualaLumpur=features.filter(feature=>feature.properties.name==="Kuala Lumpur");
  assert.equal(kualaLumpur.length,1);
  assert.equal(features.some(feature=>feature.properties.name==="Putrajaya"),false);
  const tangkak=features.find(feature=>feature.properties.name==="Tangkak");
  assert.equal(tangkak?.properties.sourceName,"Ledang");
});

test("district pin positions always fall inside the mapped district",async()=>{
  const {collections}=await loadCollections();
  for(const [file,collection] of collections){
    for(const feature of collection.features){
      const point=districtRepresentativePoint(feature.geometry);
      const polygons=feature.geometry.type==="Polygon"?[feature.geometry.coordinates]:feature.geometry.coordinates;
      assert.ok(point&&polygons.some(polygon=>isPointInPolygon(point,polygon)),`${feature.properties.name} in ${file}`);
    }
  }
});
