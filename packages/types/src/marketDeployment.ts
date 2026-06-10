export interface MarketDeploymentItem {
  artifactIdentifier: string | null;
  contentHash: string | null;
  id: string;
  messageId: string | null;
  projectKind: string;
  publicUrl: string;
  r2Key: string | null;
  sizeBytes: number | null;
  status: 'active' | 'unpublished';
  title: string | null;
  topicId: string | null;
  updatedAt: Date;
}
