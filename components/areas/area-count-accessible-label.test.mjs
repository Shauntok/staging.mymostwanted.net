import assert from "node:assert/strict";
import test from "node:test";

import {areaCountAccessibleLabel} from "./area-count-accessible-label.mjs";

test("area count labels include a localized thousands separator and post unit",()=>{
  assert.equal(areaCountAccessibleLabel("Johor",1234,"en-MY","public posts","count unavailable"),"Johor: 1,234 public posts");
  assert.equal(areaCountAccessibleLabel("柔佛",1234,"zh-CN","篇公开帖子","数量暂不可用"),"柔佛：1,234 篇公开帖子");
  assert.equal(areaCountAccessibleLabel("Johor",1234,"ms-MY","hantaran awam","kiraan tidak tersedia"),"Johor: 1,234 hantaran awam");
});

test("area count labels explain when a public count is unavailable",()=>{
  assert.equal(areaCountAccessibleLabel("Kedah",null,"en-MY","public posts","count unavailable"),"Kedah: count unavailable");
});
