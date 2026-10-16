import assert from "node:assert/strict";
import test from "node:test";

const gridModule=await import("./grid-layout.mjs").catch(()=>null);
const {buildPublicThumbnailGridLayout}=gridModule??{};

test("a failed derivative falls back to the card's normal no-image state instead of leaving empty collage cells",()=>{
  assert.equal(typeof buildPublicThumbnailGridLayout,"function","public thumbnail grid layout helper is required");
  assert.deepEqual(buildPublicThumbnailGridLayout(3,[0]),{slots:[],moreCount:0});
});

test("healthy collages show at most three image slots and preserve the overflow count",()=>{
  assert.deepEqual(buildPublicThumbnailGridLayout(5),{
    slots:[
      {position:0},
      {position:1},
      {position:2},
    ],
    moreCount:2,
  });
});
