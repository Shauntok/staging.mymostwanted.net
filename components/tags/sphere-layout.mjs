/** Assign a randomized, maximin-spaced set of public tags to a sphere. */
export function placeTags(tags,random=Math.random){
  const values=[...tags];
  const count=values.length>50?30+Math.floor(random()*21):values.length;
  for(let index=0;index<count;index++){
    const selected=index+Math.floor(random()*(values.length-index));
    [values[index],values[selected]]=[values[selected],values[index]];
  }
  const selectedTags=values.slice(0,count);
  if(count===0)return [];

  const candidateCount=Math.max(1200,count*40);
  const phase=random()*Math.PI*2;
  const goldenAngle=Math.PI*(3-Math.sqrt(5));
  const candidates=Array.from({length:candidateCount},(_,index)=>{
    const y=1-2*(index+.5)/candidateCount;
    const radius=Math.sqrt(1-y*y),angle=index*goldenAngle+phase;
    return {x:Math.cos(angle)*radius,y,z:Math.sin(angle)*radius};
  });
  const nearest=candidates.map(()=>Number.POSITIVE_INFINITY);
  const chosen=[];
  let next=Math.floor(random()*candidateCount);
  for(let index=0;index<count;index++){
    const point=candidates[next];chosen.push(point);
    let farthest=-1;
    for(let candidate=0;candidate<candidateCount;candidate++){
      const other=candidates[candidate];
      const dx=point.x-other.x,dy=point.y-other.y,dz=point.z-other.z;
      nearest[candidate]=Math.min(nearest[candidate],dx*dx+dy*dy+dz*dz);
      if(nearest[candidate]>farthest){farthest=nearest[candidate];next=candidate;}
    }
  }
  return selectedTags.map((tag,index)=>({...tag,longitude:Math.atan2(chosen[index].x,chosen[index].z),latitude:Math.asin(chosen[index].y)}));
}
