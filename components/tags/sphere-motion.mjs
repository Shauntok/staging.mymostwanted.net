export function shouldAutoRotate({reducedMotion,dragging,inertial,tagFocused}){
  return !reducedMotion&&!dragging&&!inertial&&!tagFocused;
}
