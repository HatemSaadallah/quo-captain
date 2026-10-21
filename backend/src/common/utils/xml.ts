const ENTITY: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
};

export function decodeXml(s: string): string {
  return s.replace(/&(?:lt|gt|quot|apos|amp);|&#x([0-9a-fA-F]+);|&#(\d+);/g, (m: string, hex?: string, dec?: string) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    return ENTITY[m] ?? m;
  });
}

export function encodeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Read one attribute from an XML start tag. */
export function xmlAttr(tag: string, name: string): string | undefined {
  const m = new RegExp(`[\\s<]${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : undefined;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
