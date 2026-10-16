import assert from "node:assert/strict";
import test from "node:test";

import {placeTags} from "./sphere-layout.mjs";

function fixtureTags(count){
  return Array.from({length:count},(_,index)=>({
    tag_id:`00000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,
    tag_label:`Tag ${index+1}`,
    public_post_count:index+1,
  }));
}

function seededRandom(seed){
  let value=seed>>>0;
  return ()=>{
    value=(value*1664525+1013904223)>>>0;
    return value/4294967296;
  };
}

function minimumChordDistance(points){
  let minimum=Infinity;
  for(let first=0;first<points.length;first++)for(let second=first+1;second<points.length;second++){
    const a=points[first],b=points[second];
    const ax=Math.cos(a.latitude)*Math.sin(a.longitude),ay=Math.sin(a.latitude),az=Math.cos(a.latitude)*Math.cos(a.longitude);
    const bx=Math.cos(b.latitude)*Math.sin(b.longitude),by=Math.sin(b.latitude),bz=Math.cos(b.latitude)*Math.cos(b.longitude);
    minimum=Math.min(minimum,Math.hypot(ax-bx,ay-by,az-bz));
  }
  return minimum;
}

test("keeps every tag when the directory has at most fifty",()=>{
  const tags=fixtureTags(50),layout=placeTags(tags,seededRandom(17));
  assert.equal(layout.length,50);
  assert.deepEqual(new Set(layout.map(tag=>tag.tag_id)),new Set(tags.map(tag=>tag.tag_id)));
});

test("samples a unique count from thirty through fifty for a larger directory",()=>{
  const layout=placeTags(fixtureTags(100),seededRandom(23));
  assert.ok(layout.length>=30&&layout.length<=50);
  assert.equal(new Set(layout.map(tag=>tag.tag_id)).size,layout.length);
});

test("spreads sampled tags over valid unit-sphere coordinates",()=>{
  const layout=placeTags(fixtureTags(100),seededRandom(41));
  for(const tag of layout){
    assert.ok(Number.isFinite(tag.longitude)&&tag.longitude>=-Math.PI&&tag.longitude<=Math.PI);
    assert.ok(Number.isFinite(tag.latitude)&&tag.latitude>=-Math.PI/2&&tag.latitude<=Math.PI/2);
  }
  assert.ok(minimumChordDistance(layout)>.25,"spherical points should not collapse into clusters");
});
