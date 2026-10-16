/**
 * @param {{type:"Polygon"|"MultiPolygon",coordinates:any}} geometry
 * @returns {[number,number]|null}
 */
export function districtRepresentativePoint(geometry){
  const polygons=geometry.type==="Polygon"?[geometry.coordinates]:geometry.coordinates;
  let best=null;
  for(const polygon of polygons){
    const ring=polygon[0];
    if(!ring||ring.length<4)continue;
    let crossSum=0;let xSum=0;let ySum=0;
    for(let index=0;index<ring.length-1;index++){
      const [x1,y1]=ring[index];const [x2,y2]=ring[index+1];
      const cross=x1*y2-x2*y1;
      crossSum+=cross;xSum+=(x1+x2)*cross;ySum+=(y1+y2)*cross;
    }
    const area=Math.abs(crossSum/2);
    if(area>0&&(!best||area>best.area))best={area,polygon,ring,centroid:[xSum/(3*crossSum),ySum/(3*crossSum)]};
  }
  if(!best)return null;
  if(isPointInPolygon(best.centroid,best.polygon))return best.centroid;
  let minX=Number.POSITIVE_INFINITY;let maxX=Number.NEGATIVE_INFINITY;let minY=Number.POSITIVE_INFINITY;let maxY=Number.NEGATIVE_INFINITY;
  for(const [x,y] of best.ring){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  let bestPoint=null;let bestDistance=-1;
  const distanceToRing=(x,y)=>{
    let minimum=Number.POSITIVE_INFINITY;
    for(const ring of best.polygon)for(let index=0;index<ring.length-1;index++){
      const [x1,y1]=ring[index];const [x2,y2]=ring[index+1];
      const dx=x2-x1;const dy=y2-y1;const lengthSquared=dx*dx+dy*dy;
      const ratio=lengthSquared===0?0:Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/lengthSquared));
      minimum=Math.min(minimum,Math.hypot(x-(x1+ratio*dx),y-(y1+ratio*dy)));
    }
    return minimum;
  };
  const sample=(left,right,bottom,top,steps)=>{
    for(let xIndex=0;xIndex<=steps;xIndex++)for(let yIndex=0;yIndex<=steps;yIndex++){
      const x=left+(right-left)*xIndex/steps;const y=bottom+(top-bottom)*yIndex/steps;
      if(!isPointInPolygon([x,y],best.polygon))continue;
      const distance=distanceToRing(x,y);
      if(distance>bestDistance){bestDistance=distance;bestPoint=[x,y];}
    }
  };
  sample(minX,maxX,minY,maxY,32);
  if(!bestPoint)return best.centroid;
  let xStep=(maxX-minX)/32;let yStep=(maxY-minY)/32;
  for(let pass=0;pass<4;pass++){
    const [x,y]=bestPoint;
    sample(x-xStep*2,x+xStep*2,y-yStep*2,y+yStep*2,8);
    xStep/=4;yStep/=4;
  }
  return bestPoint;
}

/** @param {[number,number]} point @param {Array<[number,number]>} ring */
export function isPointInRing([x,y],ring){
  let inside=false;
  for(let current=0,previous=ring.length-1;current<ring.length;previous=current++){
    const [currentX,currentY]=ring[current];const [previousX,previousY]=ring[previous];
    if(((currentY>y)!==(previousY>y))&&(x<(previousX-currentX)*(y-currentY)/(previousY-currentY)+currentX))inside=!inside;
  }
  return inside;
}

/** @param {[number,number]} point @param {Array<Array<[number,number]>>} polygon */
export function isPointInPolygon(point,polygon){
  return Boolean(polygon[0]&&isPointInRing(point,polygon[0])&&!polygon.slice(1).some(ring=>isPointInRing(point,ring)));
}
