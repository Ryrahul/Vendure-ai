import { RequestContext } from '@vendure/core';
import { EmbedAllJobService } from '../services/embed-all-job.service';
export declare class AiAssistantResolver {
    private embedAllJobService;
    constructor(embedAllJobService: EmbedAllJobService);
    triggerEmbedAll(ctx: RequestContext): Promise<{
        jobId: string;
        message: string;
    }>;
}
//# sourceMappingURL=ai-assistant.resolver.d.ts.map