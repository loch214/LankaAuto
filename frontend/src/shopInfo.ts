// Fictional placeholder shop details for "LankaAuto" (not a real business).
// Swap for real details whenever the user provides them.
export const SHOP = {
  addressLine1: '235 Wattala Road',
  addressLine2: 'Colombo 10, Sri Lanka',
  phonePrimary: '+94 75 543 0776',
  phoneSecondary: '+94 11 892 8494',
  fax: '+94 11 216 8823',
  email: 'hello@lankaauto.lk',
  facebook: 'https://www.facebook.com/LankaAutoParts/',
  founded: '1992',
  hours: [
    { day: 'Tuesday – Sunday', time: '8.00 AM – 5.00 PM' },
    { day: 'Monday', time: 'Closed' },
  ],
} as const;

export const shopAddress = `${SHOP.addressLine1}, ${SHOP.addressLine2}`;
export const shopMapsQuery = encodeURIComponent(shopAddress);
export const shopMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${shopMapsQuery}`;
export const shopMapsEmbedUrl = `https://www.google.com/maps?q=${shopMapsQuery}&output=embed`;
export const telHref = (n: string) => `tel:${n.replace(/\s+/g, '')}`;
