import test from "node:test";
import assert from "node:assert/strict";
import {
  clampAreaMapZoom,
  constrainAreaMapPan,
  getAreaMapPanLimit,
  getAreaMapInteractionTransform,
} from "./selected-area-map-view.mjs";

test("selected area map zoom stays within the usable view range",()=>{
  assert.equal(clampAreaMapZoom(0.4),1);
  assert.equal(clampAreaMapZoom(3.2),3.2);
  assert.equal(clampAreaMapZoom(30),12);
});

test("the selected area cannot pan at its fitted size and pans within the visible map bounds when zoomed",()=>{
  const fittedSize={width:720,height:390};
  assert.deepEqual(getAreaMapPanLimit(1,fittedSize),{x:0,y:0});
  assert.deepEqual(getAreaMapPanLimit(2,fittedSize),{x:360,y:195});
  assert.deepEqual(constrainAreaMapPan({x:700,y:-400},2,fittedSize),{x:360,y:-195});
  assert.deepEqual(constrainAreaMapPan({x:-190,y:75},1.5,fittedSize),{x:-180,y:75});
});

test("zoom keeps the map center fixed while applying the selected pan offset",()=>{
  assert.equal(
    getAreaMapInteractionTransform(2,{x:30,y:-12}),
    "translate(530 208) scale(2) translate(-500 -220)",
  );
});
