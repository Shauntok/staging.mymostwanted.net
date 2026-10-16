import sharp from "sharp";

const MAX_INPUT_BYTES=10*1024*1024;
const MAX_INPUT_PIXELS=20_000_000;
const MAX_OUTPUT_BYTES=512*1024;
const acceptedFormats=new Map([
  ["image/jpeg","jpeg"],
  ["image/png","png"],
  ["image/webp","webp"],
]);

function thumbnailError(code){
  return Object.assign(new Error("Evidence cannot be prepared as a public thumbnail."),{code});
}

export async function createPublicThumbnail(bytes,mimeType){
  const expectedFormat=acceptedFormats.get(mimeType);
  if(!expectedFormat)throw thumbnailError("unsupported_thumbnail_type");
  if(!Buffer.isBuffer(bytes)||bytes.length===0)throw thumbnailError("thumbnail_decode_failed");
  if(bytes.length>MAX_INPUT_BYTES)throw thumbnailError("thumbnail_input_too_large");

  let image;
  let metadata;
  try{
    image=sharp(bytes,{animated:true,failOn:"error",limitInputPixels:false});
    metadata=await image.metadata();
  }catch{
    throw thumbnailError("thumbnail_decode_failed");
  }

  if(metadata.format!==expectedFormat)throw thumbnailError("thumbnail_format_mismatch");
  if(!Number.isSafeInteger(metadata.width)||!Number.isSafeInteger(metadata.height)
    ||metadata.width<1||metadata.height<1||metadata.width*metadata.height>MAX_INPUT_PIXELS){
    throw thumbnailError("thumbnail_dimensions_exceeded");
  }
  if((metadata.pages??1)>1)throw thumbnailError("thumbnail_animation_unsupported");

  image=sharp(bytes,{animated:true,failOn:"error",limitInputPixels:MAX_INPUT_PIXELS});

  let output;
  try{
    output=await image
      .rotate()
      .resize({width:480,height:320,fit:"inside",withoutEnlargement:true})
      .webp({quality:76,alphaQuality:80,effort:4})
      .toBuffer();
  }catch{
    throw thumbnailError("thumbnail_decode_failed");
  }

  if(output.length===0||output.length>MAX_OUTPUT_BYTES
    ||output.length<12||output.toString("ascii",0,4)!=="RIFF"||output.toString("ascii",8,12)!=="WEBP"){
    throw thumbnailError("thumbnail_output_invalid");
  }
  return output;
}
