import {malaysiaStatePaths} from "@/lib/maps/malaysia-states";

export type MalaysiaMapArea={name:string;d:string;districtFitD:string};

const putrajaya=malaysiaStatePaths.find(({name})=>name==="W.P. Putrajaya");

export const malaysiaMapAreas:MalaysiaMapArea[]=malaysiaStatePaths.reduce<MalaysiaMapArea[]>((areas,area)=>{
  if(area.name==="W.P. Putrajaya")return areas;
  if(area.name!=="W.P. Kuala Lumpur"||!putrajaya){areas.push({...area,districtFitD:area.d});return areas;}
  areas.push({...area,d:`${area.d} ${putrajaya.d}`,districtFitD:area.d});
  return areas;
},[]);
