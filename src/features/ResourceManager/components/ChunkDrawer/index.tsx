import { Drawer } from '@lobehub/ui';
import { memo } from 'react';

import dynamic from '@/libs/next/dynamic';
import { fileManagerSelectors, useFileStore } from '@/store/file';

import Content from './Content';

const FileViewer = dynamic(() => import('@/features/FileViewer'), { ssr: false });

const ChunkDrawer = memo(() => {
  const [fileId, open, closeChunkDrawer] = useFileStore((s) => [
    s.chunkDetailId,
    !!s.chunkDetailId,
    s.closeChunkDrawer,
  ]);
  const file = useFileStore(fileManagerSelectors.getFileById(fileId));

  return (
    <Drawer
      open={open}
      sidebar={<Content />}
      sidebarWidth={320}
      title={file?.name}
      width={'min(960px, 90vw)'}
      styles={{
        bodyContent: { height: '100%' },
        sidebar: { height: '100%', overflow: 'hidden', paddingBlock: 0, paddingInline: 0 },
      }}
      onClose={() => {
        closeChunkDrawer();
      }}
    >
      {file && <FileViewer {...file} />}
    </Drawer>
  );
});

export default ChunkDrawer;
