const GRID_PRECISION=1_000_000;
const HORIZON_DEPTH=.015;

export function stableGridCoordinate(value){
  return Math.round(value*GRID_PRECISION)/GRID_PRECISION;
}

export function isFrontFacingGridDepth(depth){
  return stableGridCoordinate(depth)>HORIZON_DEPTH;
}
