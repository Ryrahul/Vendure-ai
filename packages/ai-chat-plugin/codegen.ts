import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * GraphQL Codegen configuration.
 *
 * The SDL string here must match src/api/schema-extensions.ts.
 * When you add/change schema extensions, update both places,
 * then run: npm run codegen
 */
const config: CodegenConfig = {
    overwrite: true,
    schema: `
        type EmbedAllResult {
            jobId: ID!
            message: String!
        }
        type Mutation {
            """Enqueue a background job to embed all products, variants, and collections."""
            triggerEmbedAll: EmbedAllResult!
        }
        type Query {
            _placeholder: Boolean
        }
    `,
    generates: {
        'src/generated/graphql.ts': {
            plugins: ['typescript'],
            config: {
                onlyOperationTypes: false,
                enumsAsTypes: true,
                scalars: {
                    ID: 'string',
                    DateTime: 'string',
                    JSON: 'Record<string, any>',
                    Money: 'number',
                },
            },
        },
    },
};

export default config;
