import { Resolver, Mutation } from '@nestjs/graphql';
import { Ctx, RequestContext } from '@vendure/core';
import { EmbedAllJobService } from '../services/embed-all-job.service';

@Resolver()
export class AiAssistantResolver {
    constructor(private embedAllJobService: EmbedAllJobService) {}

    @Mutation()
    async triggerEmbedAll(@Ctx() ctx: RequestContext): Promise<{
        jobId: string;
        message: string;
    }> {
        const { jobId } = await this.embedAllJobService.enqueue();
        return {
            jobId,
            message:
                'Embed-all job enqueued. Products, variants, and collections will be embedded in the background.',
        };
    }
}
