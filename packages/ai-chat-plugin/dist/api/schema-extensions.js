"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedAllSchemaExtension = void 0;
const graphql_1 = require("graphql");
exports.embedAllSchemaExtension = (0, graphql_1.parse)(`
  type EmbedAllResult {
    jobId: ID!
    message: String!
  }
  extend type Mutation {
    """Enqueue a background job to embed all products, variants, and collections."""
    triggerEmbedAll: EmbedAllResult!
  }
`);
//# sourceMappingURL=schema-extensions.js.map