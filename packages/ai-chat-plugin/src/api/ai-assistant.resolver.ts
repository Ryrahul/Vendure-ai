import { Resolver, Mutation } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { EmbedAllJobService } from '../services/embed-all-job.service';
import type { EmbedAllResult } from '../generated/graphql';

@Resolver()
export class AiAssistantResolver {
    constructor(private embedAllJobService: EmbedAllJobService) {}

    /** Re-embeds the whole catalog (costs OpenAI usage), so it needs catalog update rights. */
    @Mutation()
    @Allow(Permission.UpdateCatalog, Permission.UpdateProduct)
    async triggerEmbedAll(@Ctx() ctx: RequestContext): Promise<EmbedAllResult> {
        const { jobId } = await this.embedAllJobService.enqueue();
        return {
            jobId,
            message:
                'Embed-all job enqueued. Products, variants, and collections will be embedded in the background.',
        };
    }
}
