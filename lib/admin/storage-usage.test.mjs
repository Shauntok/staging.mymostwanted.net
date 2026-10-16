import assert from "node:assert/strict";
import test from "node:test";
import {parseStaffStorageUsage} from "./storage-usage.mjs";

test("parses evidence and thumbnail storage totals without exposing object metadata",()=>{
  assert.deepEqual(parseStaffStorageUsage([{
    evidence_object_count:3,
    evidence_total_bytes:"1048576",
    thumbnail_object_count:"7",
    thumbnail_total_bytes:4096,
    object_names:["must-not-be-returned"],
  }]),{
    evidenceObjectCount:3,
    evidenceTotalBytes:1048576,
    thumbnailObjectCount:7,
    thumbnailTotalBytes:4096,
  });
});

test("rejects missing, negative, fractional, and unsafe aggregate values",()=>{
  for(const value of [
    null,
    [],
    [{evidence_object_count:0,evidence_total_bytes:0,thumbnail_object_count:0}],
    [{evidence_object_count:-1,evidence_total_bytes:0,thumbnail_object_count:0,thumbnail_total_bytes:0}],
    [{evidence_object_count:0,evidence_total_bytes:"1.5",thumbnail_object_count:0,thumbnail_total_bytes:0}],
    [{evidence_object_count:0,evidence_total_bytes:0,thumbnail_object_count:0,thumbnail_total_bytes:"9007199254740992"}],
  ])assert.equal(parseStaffStorageUsage(value),null);
});
