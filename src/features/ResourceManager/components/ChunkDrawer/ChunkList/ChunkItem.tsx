import { memo } from 'react';

import { useFileStore } from '@/store/file';
import { type FileChunk } from '@/types/chunk';

import ChunkCard from '../ChunkCard';

type ChunkItemProps = FileChunk;

const ChunkItem = memo<ChunkItemProps>(({ text, type, id }) => {
  const highlightChunks = useFileStore((s) => s.highlightChunks);

  return (
    <ChunkCard
      text={text}
      type={type}
      onMouseEnter={() => {
        highlightChunks([id]);
      }}
      onMouseLeave={() => {
        highlightChunks([]);
      }}
    />
  );
});

export default ChunkItem;
