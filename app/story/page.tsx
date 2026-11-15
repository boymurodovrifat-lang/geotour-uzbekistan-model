import type { Metadata } from 'next';
import Story from '../story';
export const metadata: Metadata = {
  title: 'Buyuk Ipak yo‘li bo‘ylab · GeoTour Uzbekistan',
  description: 'Xivadan Toshkentgacha hikoya xaritasi: tarix, manzara, turistik salohiyat va iqlim.',
};
export default function StoryPage() {
  return <Story />;
}
