import type {Locale} from "@/lib/i18n/catalog";

const localizedStateNames: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    Johor:"柔佛", Kedah:"吉打", Kelantan:"吉兰丹", Melaka:"马六甲", "Negeri Sembilan":"森美兰", Pahang:"彭亨", Penang:"槟城", Perak:"霹雳", Perlis:"玻璃市", Sabah:"沙巴", Sarawak:"砂拉越", Selangor:"雪兰莪", Terengganu:"登嘉楼", "W.P. Kuala Lumpur":"吉隆坡联邦直辖区", "W.P. Labuan":"纳闽联邦直辖区", "W.P. Putrajaya":"布城联邦直辖区", Singapore:"新加坡",
  },
  en: {
    Johor:"Johor", Kedah:"Kedah", Kelantan:"Kelantan", Melaka:"Melaka", "Negeri Sembilan":"Negeri Sembilan", Pahang:"Pahang", Penang:"Penang", Perak:"Perak", Perlis:"Perlis", Sabah:"Sabah", Sarawak:"Sarawak", Selangor:"Selangor", Terengganu:"Terengganu", "W.P. Kuala Lumpur":"Federal Territory of Kuala Lumpur", "W.P. Labuan":"Federal Territory of Labuan", "W.P. Putrajaya":"Federal Territory of Putrajaya", Singapore:"Singapore",
  },
  ms: {
    Johor:"Johor", Kedah:"Kedah", Kelantan:"Kelantan", Melaka:"Melaka", "Negeri Sembilan":"Negeri Sembilan", Pahang:"Pahang", Penang:"Pulau Pinang", Perak:"Perak", Perlis:"Perlis", Sabah:"Sabah", Sarawak:"Sarawak", Selangor:"Selangor", Terengganu:"Terengganu", "W.P. Kuala Lumpur":"Wilayah Persekutuan Kuala Lumpur", "W.P. Labuan":"Wilayah Persekutuan Labuan", "W.P. Putrajaya":"Wilayah Persekutuan Putrajaya", Singapore:"Singapura",
  },
};

export function stateDisplayName(locale:Locale, state:string) {
  return localizedStateNames[locale][state] ?? state;
}
