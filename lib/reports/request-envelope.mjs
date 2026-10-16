const maxBodyBytes=32_768;

/**
 * Check the report endpoint's browser request envelope and parse its JSON body.
 * @param {Request} request
 * @returns {Promise<{ok:true,body:unknown}|{ok:false,status:400|403|413|415}>}
 */
export async function parseReportRequestEnvelope(request){
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)return {ok:false,status:403};
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")return {ok:false,status:415};
  const length=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(length)&&length>maxBodyBytes)return {ok:false,status:413};

  let text="";
  if(request.body){
    const reader=request.body.getReader();
    const decoder=new TextDecoder();
    let total=0;
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>maxBodyBytes){await reader.cancel();return {ok:false,status:413};}
        text+=decoder.decode(value,{stream:true});
      }
      text+=decoder.decode();
    }catch{return {ok:false,status:413};}
  }

  try{return {ok:true,body:JSON.parse(text)};}
  catch{return {ok:false,status:400};}
}
