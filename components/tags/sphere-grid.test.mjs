import assert from "node:assert/strict";
import test from "node:test";

import {isFrontFacingGridDepth,stableGridCoordinate} from "./sphere-grid.mjs";

test("rounds projected grid coordinates before serializing SVG paths",()=>{
  assert.equal(stableGridCoordinate(245.768137204993),245.768137);
  assert.equal(stableGridCoordinate(245.768137204994),245.768137);
});

test("keeps tiny floating-point differences at the horizon on the same side",()=>{
  assert.equal(isFrontFacingGridDepth(.015-1e-12),false);
  assert.equal(isFrontFacingGridDepth(.015+1e-12),false);
  assert.equal(isFrontFacingGridDepth(.015002),true);
  assert.equal(isFrontFacingGridDepth(.014998),false);
});
