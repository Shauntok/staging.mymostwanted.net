export type PublicThumbnailGridSlot={position:number};
export function buildPublicThumbnailGridLayout(thumbnailCount:number,failedPositions?:readonly number[]):{
  slots:PublicThumbnailGridSlot[];
  moreCount:number;
};
