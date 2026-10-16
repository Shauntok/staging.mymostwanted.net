export function areaCountAccessibleLabel(name,count,locale,countUnit,countUnavailable){
  const separator=locale==="zh-CN"?"：":": ";
  const suffix=Number.isSafeInteger(count)&&count>=0
    ?`${new Intl.NumberFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY").format(count)} ${countUnit}`
    :countUnavailable;
  return `${name}${separator}${suffix}`;
}
