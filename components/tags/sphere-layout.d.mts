type Tag={tag_id:string};
type SphereTag<T extends Tag> = T & {longitude:number;latitude:number};
export function placeTags<T extends Tag>(tags:T[],random?:()=>number):SphereTag<T>[];
