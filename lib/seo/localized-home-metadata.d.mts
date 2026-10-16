export function localizedHomeMetadata(localeSegment: string, origin: string | null): {
  alternates?: {canonical: string; languages: Record<string, string>};
  robots: {index: boolean; follow: boolean};
};
