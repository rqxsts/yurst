import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { i18n } from '@/lib/i18n';

export default createI18nMiddleware(i18n);

export const config = {
  // Skip internal routes and static files from /public
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
