import assert from "node:assert/strict";
import sharp from "sharp";
import {test} from "node:test";
import {createPublicThumbnail} from "./thumbnails.mjs";

async function createPng({width=2,height=2}={}){
  return sharp({
    create:{width,height,channels:4,background:{r:40,g:120,b:180,alpha:1}},
  }).png().toBuffer();
}

test("public thumbnail is a bounded WebP derivative with source metadata removed",async()=>{
  const source=await sharp({
    create:{width:1200,height:800,channels:3,background:{r:40,g:120,b:180}},
  }).jpeg().withMetadata({orientation:6}).toBuffer();

  const thumbnail=await createPublicThumbnail(source,"image/jpeg");
  const output=await sharp(thumbnail).metadata();

  assert.equal(output.format,"webp");
  assert.ok(output.width<=480);
  assert.ok(output.height<=320);
  assert.equal(output.orientation,undefined);
  assert.equal(output.exif,undefined);
  assert.equal(output.iptc,undefined);
  assert.equal(output.xmp,undefined);
  assert.ok(thumbnail.length<=512*1024);
});

test("public thumbnail processing rejects non-raster and unsupported MIME types",async()=>{
  const png=await createPng();
  await assert.rejects(createPublicThumbnail(Buffer.from("<svg/>"),"image/svg+xml"),{code:"unsupported_thumbnail_type"});
  await assert.rejects(createPublicThumbnail(png,"image/gif"),{code:"unsupported_thumbnail_type"});
});

test("public thumbnail processing rejects oversized input and decoded dimensions",async()=>{
  const tooLarge=Buffer.alloc(10*1024*1024+1);
  await assert.rejects(createPublicThumbnail(tooLarge,"image/png"),{code:"thumbnail_input_too_large"});

  const tooManyPixels=await createPng({width:5001,height:4001});
  await assert.rejects(createPublicThumbnail(tooManyPixels,"image/png"),{code:"thumbnail_dimensions_exceeded"});
});

test("public thumbnail processing rejects malformed image data",async()=>{
  await assert.rejects(createPublicThumbnail(Buffer.from("not an image"),"image/png"),{code:"thumbnail_decode_failed"});
});
