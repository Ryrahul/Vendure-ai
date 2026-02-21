import { parse } from 'graphql';
import type { DocumentNode } from 'graphql';

export const embedAllSchemaExtension: DocumentNode = parse(`
  type EmbedAllResult {
    jobId: ID!
    message: String!
  }
  extend type Mutation {
    """Enqueue a background job to embed all products, variants, and collections."""
    triggerEmbedAll: EmbedAllResult!
  }
`);
