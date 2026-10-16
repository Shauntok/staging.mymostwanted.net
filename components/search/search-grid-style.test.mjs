import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const stylesheetPath=fileURLToPath(new URL("./SearchExperience.module.css",import.meta.url));

test("search styles do not leak legacy selectors into the shared public post grid",async()=>{
  const stylesheet=await readFile(stylesheetPath,"utf8");

  assert.doesNotMatch(stylesheet,/\.results\s+article\b/);
  assert.doesNotMatch(stylesheet,/\.results\s+h3\b/);
  assert.doesNotMatch(stylesheet,/\.results\s+time\b/);
});
