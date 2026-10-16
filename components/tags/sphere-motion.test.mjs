import assert from "node:assert/strict";
import test from "node:test";

import {shouldAutoRotate} from "./sphere-motion.mjs";

test("auto rotation runs only while motion is allowed and the globe has no active interaction",()=>{
  assert.equal(shouldAutoRotate({reducedMotion:false,dragging:false,inertial:false,tagFocused:false}),true);
  assert.equal(shouldAutoRotate({reducedMotion:true,dragging:false,inertial:false,tagFocused:false}),false);
  assert.equal(shouldAutoRotate({reducedMotion:false,dragging:true,inertial:false,tagFocused:false}),false);
  assert.equal(shouldAutoRotate({reducedMotion:false,dragging:false,inertial:true,tagFocused:false}),false);
});

test("keyboard focus on a sphere tag pauses rotation",()=>{
  assert.equal(shouldAutoRotate({reducedMotion:false,dragging:false,inertial:false,tagFocused:true}),false);
});
