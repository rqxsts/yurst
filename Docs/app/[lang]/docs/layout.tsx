import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { getLayoutTabs } from 'fumadocs-ui/layouts/shared';
import type * as PageTree from 'fumadocs-core/page-tree';
import { baseOptions } from '@/lib/layout.shared';
import '../../style/main.css';

function aliasLibraryIndex(node: PageTree.Node): PageTree.Node {
  if (node.type !== 'folder') return node;

  const libraryIndexUrl = '/uk/docs/lib';
  const isLibraryRoot = node.index?.url === libraryIndexUrl;

  return {
    ...node,
    index: isLibraryRoot ? { ...node.index!, url: '/uk/docs' } : node.index,
    children: node.children.map((child) => {
      if (isLibraryRoot && child.type === 'page' && child.url === libraryIndexUrl) {
        return { ...child, url: '/uk/docs' };
      }

      return aliasLibraryIndex(child);
    }),
  };
}

function collectFolderUrls(folder: PageTree.Folder, urls: Set<string>) {
  if (folder.index) urls.add(folder.index.url);

  for (const child of folder.children) {
    if (child.type === 'page') urls.add(child.url);
    if (child.type === 'folder') collectFolderUrls(child, urls);
  }
}

export default async function Layout({ params, children }: LayoutProps<'/[lang]/docs'>) {
  const { lang } = await params;
  const sourceTree = source.getPageTree(lang);
  const tree = lang === 'uk'
    ? { ...sourceTree, children: sourceTree.children.map(aliasLibraryIndex) }
    : sourceTree;
  const tabs = getLayoutTabs(tree).map(({ $folder, ...tab }) => {
    const urls = new Set([tab.url]);
    if ($folder) collectFolderUrls($folder, urls);
    if (lang === 'uk' && tab.url === '/uk/docs') urls.add('/uk/docs/lib');

    return { ...tab, urls };
  });

  return (
    <DocsLayout {...baseOptions(lang)} tree={tree} tabs={tabs}>
      {children}
    </DocsLayout>
  );
}
