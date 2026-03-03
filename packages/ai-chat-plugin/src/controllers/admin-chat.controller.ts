import { Body, Controller, Post, Logger } from '@nestjs/common';

export interface AdminChatRequest {
    message: string;
}

export interface AdminChatResponse {
    message: string;
}

/**
 * REST controller for the admin dashboard AI chat.
 * For now it just echoes back "Hello!" to any message.
 * This will be replaced with real AI chat logic later (admin-specific tools, system prompt, etc.).
 */
@Controller('admin-ai-chat')
export class AdminChatController {
    private readonly logger = new Logger(AdminChatController.name);

    @Post('chat')
    async chat(@Body() body: AdminChatRequest): Promise<AdminChatResponse> {
        this.logger.log(`Admin chat message: ${body.message}`);
        return {
            message: `Hello! You said: "${body.message}". I'm the admin AI assistant — real AI features coming soon!`,
        };
    }
}
