// Link utilities for formatting, shortening, and filtering harmful links

// Blocked domain patterns (porn, gore, crypto scams, etc.)
const BLOCKED_DOMAINS = [
  // Adult content
  'pornhub', 'xvideos', 'xnxx', 'xhamster', 'redtube', 'youporn', 'tube8', 
  'spankbang', 'brazzers', 'bangbros', 'onlyfans', 'fansly', 'chaturbate',
  'livejasmin', 'cam4', 'stripchat', 'myfreecams', 'bongacams',
  // Gore
  'liveleak', 'bestgore', 'theync', 'goregrish', 'documenting',
  // Crypto scams (common patterns)
  'binance-promo', 'crypto-airdrop', 'free-bitcoin', 'bitcoin-giveaway',
  'eth-giveaway', 'crypto-bonus', 'tokenbonus', 'airdrop-claim',
  'presale-token', 'pump-group', 'crypto-signals', 'guaranteed-profit',
  // Scam patterns
  'get-rich', 'millionaire-secret', 'make-money-fast', 'passive-income-secret',
  'influencer-giveaway', 'celebrity-giveaway', 'verified-giveaway',
];

// Scam content patterns in text
const SCAM_PATTERNS = [
  /\b(free\s+crypto|free\s+bitcoin|free\s+eth|free\s+money)\b/i,
  /\b(guaranteed\s+(profit|returns?|income))\b/i,
  /\b(10x|100x|1000x)\s+(gains?|profit|returns?)\b/i,
  /\b(airdrop|presale|ico)\s+(claim|link|join)\b/i,
  /\b(dm\s+me|message\s+me)\s+for\s+(passive\s+income|crypto|investment)\b/i,
  /\b(elon|musk|bezos|gates)\s+(giveaway|giving\s+away)\b/i,
  /\b(limited\s+time|act\s+now|hurry|don't\s+miss)\s+(crypto|investment|opportunity)\b/i,
  /\b(verified|official)\s+(giveaway|promotion|airdrop)\b/i,
];

/**
 * Check if a URL contains a blocked domain
 */
export function isBlockedLink(url: string): boolean {
  // Match against the hostname only so legitimate URLs that merely mention a
  // blocked word in their path/query (e.g. a news article) are not blocked.
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_DOMAINS.some(domain => hostname.includes(domain));
  } catch {
    // Malformed/relative URL: fall back to substring match to stay safe.
    const lowerUrl = url.toLowerCase();
    return BLOCKED_DOMAINS.some(domain => lowerUrl.includes(domain));
  }
}

/**
 * Check if content contains scam patterns
 */
export function containsScamContent(content: string): boolean {
  return SCAM_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Filter posts that contain harmful content for feed display
 */
export function isPostAllowedInFeed(content: string, mediaUrls?: string[]): boolean {
  // Check text content for scam patterns
  if (containsScamContent(content)) {
    return false;
  }
  
  // Extract URLs from content and check for blocked domains
  const urls = extractUrls(content);
  if (urls.some(url => isBlockedLink(url))) {
    return false;
  }
  
  // Check media URLs
  if (mediaUrls && mediaUrls.some(url => isBlockedLink(url))) {
    return false;
  }
  
  return true;
}

/**
 * Extract all URLs from text content
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  return text.match(urlRegex) || [];
}

/**
 * Shorten a URL for display (e.g., "www.example.com/long/path..." → "example.com/long...")
 */
export function shortenUrl(url: string, maxLength: number = 35): string {
  try {
    // Remove protocol
    let shortened = url.replace(/^https?:\/\//, '');
    // Remove www
    shortened = shortened.replace(/^www\./, '');
    
    if (shortened.length <= maxLength) {
      return shortened;
    }
    
    // Split into domain and path
    const slashIndex = shortened.indexOf('/');
    if (slashIndex === -1) {
      return shortened.slice(0, maxLength - 3) + '...';
    }
    
    const domain = shortened.slice(0, slashIndex);
    const path = shortened.slice(slashIndex);
    
    // Ensure domain is always fully visible
    const remainingLength = maxLength - domain.length - 3; // 3 for "..."
    
    if (remainingLength <= 0) {
      return domain.slice(0, maxLength - 3) + '...';
    }
    
    return domain + path.slice(0, remainingLength) + '...';
  } catch {
    return url.slice(0, maxLength - 3) + '...';
  }
}

/**
 * Parse content and replace URLs with formatted link objects
 */
export interface ParsedTextPart {
  type: 'text' | 'link';
  content: string;
  href?: string;
  isBlocked?: boolean;
}

export function parseContentWithLinks(content: string): ParsedTextPart[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts: ParsedTextPart[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = urlRegex.exec(content)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }
    
    const url = match[0];
    const isBlocked = isBlockedLink(url);
    
    parts.push({
      type: 'link',
      content: shortenUrl(url),
      href: url,
      isBlocked
    });
    
    lastIndex = match.index + url.length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }
  
  return parts.length > 0 ? parts : [{ type: 'text', content }];
}
