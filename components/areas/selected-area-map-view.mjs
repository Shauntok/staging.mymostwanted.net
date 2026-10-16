export const selectedAreaMapMinZoom=1;
export const selectedAreaMapMaxZoom=12;

export function clampAreaMapZoom(value){
  if(!Number.isFinite(value))return selectedAreaMapMinZoom;
  return Math.max(selectedAreaMapMinZoom,Math.min(selectedAreaMapMaxZoom,value));
}

export function getAreaMapPanLimit(zoom,fittedSize){
  const scale=clampAreaMapZoom(zoom);
  const width=Number.isFinite(fittedSize?.width)&&fittedSize.width>0?fittedSize.width:0;
  const height=Number.isFinite(fittedSize?.height)&&fittedSize.height>0?fittedSize.height:0;
  return {x:(scale-1)*width/2,y:(scale-1)*height/2};
}

export function constrainAreaMapPan(pan,zoom,fittedSize){
  const limit=getAreaMapPanLimit(zoom,fittedSize);
  const x=Number.isFinite(pan?.x)?pan.x:0;
  const y=Number.isFinite(pan?.y)?pan.y:0;
  return {
    x:Math.max(-limit.x,Math.min(limit.x,x)),
    y:Math.max(-limit.y,Math.min(limit.y,y)),
  };
}

export function getAreaMapInteractionTransform(zoom,pan){
  const scale=clampAreaMapZoom(zoom);
  const x=Number.isFinite(pan?.x)?pan.x:0;
  const y=Number.isFinite(pan?.y)?pan.y:0;
  const format=(value)=>String(Math.round(value*1000)/1000);
  return `translate(${format(500+x)} ${format(220+y)}) scale(${format(scale)}) translate(-500 -220)`;
}
