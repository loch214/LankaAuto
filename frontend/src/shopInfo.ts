// Real shop details sourced from dahanayakemotors.com
// Using "LankaAuto" as the working brand name.
export const SHOP = {
  addressLine1: '24 Orugodawatta Road',
  addressLine2: 'Colombo 14, Sri Lanka',
  phonePrimary: '+94 74 009 8323',
  phoneSecondary: '+94 11 238 6686',
  fax: '+94 11 238 6686',
  email: 'info@dahanayakemotors.com',
  facebook: 'https://www.facebook.com/DahanayakeMotors/',
  founded: '1965',
  hours: [
    { day: 'Monday – Friday', time: '8.00 AM – 6.00 PM' },
    { day: 'Saturday', time: '8.00 AM – 4.00 PM' },
    { day: 'Sunday', time: 'Closed' },
  ],
} as const;

export const shopAddress = `${SHOP.addressLine1}, ${SHOP.addressLine2}`;
export const shopMapsQuery = encodeURIComponent(shopAddress);
export const shopMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${shopMapsQuery}`;
export const shopMapsEmbedUrl = `https://www.google.com/maps?q=${shopMapsQuery}&output=embed`;
export const telHref = (n: string) => `tel:${n.replace(/\s+/g, '')}`;
