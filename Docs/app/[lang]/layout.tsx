import 'fumadocs-ui/style.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import { translations } from '@/lib/layout.shared';
import { i18n } from '@/lib/i18n';
import { i18nProvider } from 'fumadocs-ui/i18n';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

const siteMeta = {
  en: {
    title: 'Yurst — a library for Yurba.one bots',
    description:
      'Yurst documentation: commands, inline buttons, callbacks, reply keyboards, transport and the API reference for Yurba.one bots.',
  },
  uk: {
    title: 'Yurst — бібліотека для ботів Yurba.one',
    description:
      'Документація Yurst: команди, inline-кнопки, callback-и, reply-клавіатури, транспорт і довідник API для ботів Yurba.one.',
  },
};

export async function generateMetadata({
  params,
}: LayoutProps<'/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  const copy = siteMeta[lang as keyof typeof siteMeta] ?? siteMeta.en;

  return {
    title: {
      default: copy.title,
      template: '%s | Yurst',
    },
    description: copy.description,
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/logo.svg', type: 'image/svg+xml' },
      ],
      apple: '/yurst.png',
    },
  };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function Layout({ params, children }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <RootProvider i18n={i18nProvider(translations, lang)}>{children}</RootProvider>
      </body>
    </html>
  );
}
