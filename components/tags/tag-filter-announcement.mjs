const messages={
  "zh-CN":(_count,formattedCount)=>`${formattedCount} 个标签`,
  en:(count,formattedCount)=>`${formattedCount} ${count===1?"tag":"tags"} found`,
  ms:(_count,formattedCount)=>`${formattedCount} tag ditemui`,
};

/** Localized screen-reader announcement for a completed tag-name filter update. */
export function tagFilterAnnouncement(count,locale){
  if(!Number.isSafeInteger(count)||count<0||!Object.hasOwn(messages,locale))return "";
  return messages[locale](count,new Intl.NumberFormat(locale).format(count));
}
