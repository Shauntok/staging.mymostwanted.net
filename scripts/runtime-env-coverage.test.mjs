import test from "node:test";
import assert from "node:assert/strict";
import {collectRuntimeEnvExampleGaps,extractRuntimeEnvNames} from "./runtime-env-coverage.mjs";

test("extracts direct, destructured, and aliased runtime environment names",()=>{
  const source=`
    process.env.NEXT_PUBLIC_SITE_URL;
    process.env["TURNSTILE_SECRET_KEY"];
    const {SMTP_HOST, SMTP_PORT: port} = process.env;
    const env = process.env;
    env.SUPABASE_URL;
    const {SUPABASE_SECRET_KEY} = env;
    function read({env = process.env}) { return env.MMWR_BACKUP_ENABLED; }
  `;

  assert.deepEqual([...extractRuntimeEnvNames(source)].sort(),[
    "MMWR_BACKUP_ENABLED",
    "NEXT_PUBLIC_SITE_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_URL",
    "TURNSTILE_SECRET_KEY",
  ]);
});

test("every static runtime environment reference has an entry in .env.example or a platform exemption",async()=>{
  assert.deepEqual(await collectRuntimeEnvExampleGaps(process.cwd()),[]);
});
