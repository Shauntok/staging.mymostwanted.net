const postCountLabels={
  "zh-CN":count=>`，${count} 篇公开内容`,
  en:count=>`, ${count} public posts`,
  ms:count=>`, ${count} hantaran awam`,
};

/** Include the visible tag name and its public post count in the sphere link's accessible name. */
export function sphereTagAccessibleLabel(label,postCount,locale){
  if(typeof label!=="string"||!label.trim()||!Number.isSafeInteger(postCount)||postCount<0||!Object.hasOwn(postCountLabels,locale))return "";
  const formattedCount=new Intl.NumberFormat(locale).format(postCount);
  return `${label}${postCountLabels[locale](formattedCount)}`;
}
