import assert from "node:assert/strict";
import {test} from "node:test";
import {parseReportRequestEnvelope} from "./request-envelope.mjs";

const endpoint="https://mmwr.example.my/api/reports";
const validHeaders={origin:"https://mmwr.example.my","content-type":"application/json; charset=utf-8"};

function request(body,headers=validHeaders){
  return new Request(endpoint,{method:"POST",headers,body});
}

test("accepts same-origin JSON with a charset parameter",async()=>{
  const result=await parseReportRequestEnvelope(request('{"kind":"feedback"}'));
  assert.deepEqual(result,{ok:true,body:{kind:"feedback"}});
});

test("rejects missing and cross-origin Origin headers before reading the body",async(t)=>{
  for(const [name,headers] of [
    ["missing origin",{"content-type":"application/json"}],
    ["cross origin",{...validHeaders,origin:"https://attacker.example"}],
  ]){
    await t.test(name,async()=>{
      const result=await parseReportRequestEnvelope(request('{"kind":"feedback"}',headers));
      assert.deepEqual(result,{ok:false,status:403});
    });
  }
});

test("requires the JSON media type",async(t)=>{
  for(const contentType of ["text/plain","application/jsonp","application/x-www-form-urlencoded"]){
    await t.test(contentType,async()=>{
      const result=await parseReportRequestEnvelope(request("{}",{...validHeaders,"content-type":contentType}));
      assert.deepEqual(result,{ok:false,status:415});
    });
  }
});

test("rejects malformed JSON and empty POST bodies",async(t)=>{
  for(const [name,body] of [["malformed JSON","{"],["empty body",null]]){
    await t.test(name,async()=>{
      const result=await parseReportRequestEnvelope(request(body));
      assert.deepEqual(result,{ok:false,status:400});
    });
  }
});

test("accepts a valid JSON body at the 32 KiB boundary",async()=>{
  const compact="{\"ok\":true}";
  const body=`${compact}${" ".repeat(32_768-compact.length)}`;
  const result=await parseReportRequestEnvelope(request(body,{...validHeaders,"content-length":"32768"}));
  assert.deepEqual(result,{ok:true,body:{ok:true}});
});

test("rejects a declared body larger than 32 KiB before reading it",async()=>{
  const result=await parseReportRequestEnvelope(request("{}",{...validHeaders,"content-length":"32769"}));
  assert.deepEqual(result,{ok:false,status:413});
});

test("enforces the 32 KiB limit against streamed bytes when Content-Length is absent",async()=>{
  const chunks=[new Uint8Array(20_000),new Uint8Array(12_769)];
  const body=new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}});
  const streamedRequest=new Request(endpoint,{method:"POST",headers:validHeaders,body,duplex:"half"});
  const result=await parseReportRequestEnvelope(streamedRequest);
  assert.deepEqual(result,{ok:false,status:413});
});
