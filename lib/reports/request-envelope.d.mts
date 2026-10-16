export function parseReportRequestEnvelope(request:Request):Promise<
  {ok:true;body:unknown}|{ok:false;status:400|403|413|415}
>;
