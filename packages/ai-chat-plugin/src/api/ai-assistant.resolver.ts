import { Resolver, Mutation } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { EmbedAllJobService } from '../services/embed-all-job.service';
import type { EmbedAllResult } from '../generated/graphql';

@Resolver()
export class AiAssistantResolver {
    constructor(private embedAllJobService: EmbedAllJobService) {}

    @Mutation()
    async triggerEmbedAll(@Ctx() ctx: RequestContext): Promise<EmbedAllResult> {
        const { jobId } = await this.embedAllJobService.enqueue();
        return {
            jobId,
            message:
                'Embed-all job enqueued. Products, variants, and collections will be embedded in the background.',
        };
    }
}
