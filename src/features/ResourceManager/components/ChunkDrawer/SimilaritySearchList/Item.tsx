import { memo } from 'react';

import { type SemanticSearchChunk } from '@/types/chunk';

import ChunkCard from '../ChunkCard';

interface ChunkItemProps extends Omit<SemanticSearchChunk, 'index'> {
  index: number;
}

const SearchItem = memo<ChunkItemProps>(({ text, pageNumber, type, similarity }) => (
  <ChunkCard pageNumber={pageNumber} similarity={similarity} text={text} type={type} />
));

export default SearchItem;
