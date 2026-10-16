import type {ReactNode} from "react";

export type ReactionIconId = "spark" | "heart" | "thumbs_up" | "hands" | "check" | "lightbulb";

const paths: Record<ReactionIconId, ReactNode> = {
  spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
  heart: <path d="M20.8 8.7c0 4.2-8.8 10-8.8 10s-8.8-5.8-8.8-10A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>,
  thumbs_up: <path d="M7 10v10H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h3Zm0 0 5-7c1.5 0 2.4 1.3 2 2.8L13 10h5.2a2.3 2.3 0 0 1 2.2 2.9l-1.7 5.8a2 2 0 0 1-1.9 1.4H7"/>,
  hands: <><path d="M12 20s-8-4.7-8-10a4.2 4.2 0 0 1 8-1.7A4.2 4.2 0 0 1 20 10c0 5.3-8 10-8 10Z"/><path d="M8.7 12.2 11 14l4.3-4"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
  lightbulb: <><path d="M9 18h6m-5 3h4m-6-6a7 7 0 1 1 8 0c-.8.6-1 1.2-1 2H9c0-.8-.2-1.4-1-2Z"/><path d="M12 4v1"/></>,
};

export function ReactionGlyph({iconId,className}:{iconId:ReactionIconId;className?:string}){
  return <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[iconId]}</svg>;
}
