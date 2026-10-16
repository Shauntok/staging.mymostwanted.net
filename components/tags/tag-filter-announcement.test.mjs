import assert from "node:assert/strict";
import test from "node:test";
import {tagFilterAnnouncement} from "./tag-filter-announcement.mjs";

test("tag filter result announcements are localized and use locale number formatting",()=>{
  assert.equal(tagFilterAnnouncement(0,"zh-CN"),"0 个标签");
  assert.equal(tagFilterAnnouncement(1234,"zh-CN"),"1,234 个标签");
  assert.equal(tagFilterAnnouncement(1,"en"),"1 tag found");
  assert.equal(tagFilterAnnouncement(3,"en"),"3 tags found");
  assert.equal(tagFilterAnnouncement(3,"ms"),"3 tag ditemui");
});

test("invalid counts and unsupported locales do not produce an announcement",()=>{
  assert.equal(tagFilterAnnouncement(-1,"en"),"");
  assert.equal(tagFilterAnnouncement(1,"fr"),"");
});
