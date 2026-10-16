import assert from "node:assert/strict";
import test from "node:test";

import {sphereTagAccessibleLabel} from "./sphere-tag-accessible-label.mjs";

test("sphere tag links expose their public-post count in the active language",()=>{
  assert.equal(sphereTagAccessibleLabel("租房经验",1234,"zh-CN"),"租房经验，1,234 篇公开内容");
  assert.equal(sphereTagAccessibleLabel("Rental tips",1234,"en"),"Rental tips, 1,234 public posts");
  assert.equal(sphereTagAccessibleLabel("Tip sewa rumah",1234,"ms"),"Tip sewa rumah, 1,234 hantaran awam");
});

test("sphere tag accessible labels include the complete visible tag name",()=>{
  const label=sphereTagAccessibleLabel("交通与出行",7,"zh-CN");
  assert.ok(label.startsWith("交通与出行"));
  assert.match(label,/7 篇公开内容$/);
});

test("invalid tag counts and unknown locales do not create misleading accessible names",()=>{
  assert.equal(sphereTagAccessibleLabel("Rental tips",-1,"en"),"");
  assert.equal(sphereTagAccessibleLabel("Rental tips",1,"fr"),"");
});
