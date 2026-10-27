// Fonts from the prototypes: Cormorant Garamond (display, DECISIONS D-07),
// Geist (UI) and Geist Mono (codes, times, prices, labels).
import { Cormorant_Garamond, Geist, Geist_Mono } from 'next/font/google';

export const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});
export const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-geist', display: 'swap' });
export const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono', display: 'swap' });
