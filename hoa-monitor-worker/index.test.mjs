import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";
test("unrecognized routes return 404",async()=>{const r=await worker.fetch(new Request("https://example.test/"),{});assert.equal(r.status,404)});
test("ingest requires configured bindings",async()=>{const r=await worker.fetch(new Request("https://example.test/ingest",{method:"POST",body:"{}"}),{});assert.equal(r.status,503)});
test("unsigned ingest rejected before parsing",async()=>{const r=await worker.fetch(new Request("https://example.test/ingest",{method:"POST",body:"{}"}),{HOA_MONITOR_KV:{},HOA_INGEST_SECRET:"test-only"});assert.equal(r.status,401)});
test("large payload rejected",async()=>{const r=await worker.fetch(new Request("https://example.test/ingest",{method:"POST",body:"x".repeat(100001)}),{HOA_MONITOR_KV:{},HOA_INGEST_SECRET:"test-only"});assert.equal(r.status,413)});
