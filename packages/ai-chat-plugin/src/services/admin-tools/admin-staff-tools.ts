import { Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection, Administrator, Role } from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminStaffTools {
    private readonly logger = new Logger(AdminStaffTools.name);

    constructor(
        private connection: TransactionalConnection,
    ) {}

    async getAdministrators(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Administrator);

        let qb = repo.createQueryBuilder('admin')
            .leftJoinAndSelect('admin.user', 'user')
            .leftJoinAndSelect('user.roles', 'role')
            .where('admin.deletedAt IS NULL');

        if (query) {
            qb = qb.andWhere(
                '(LOWER(admin.firstName) LIKE :term OR LOWER(admin.lastName) LIKE :term OR LOWER(admin.emailAddress) LIKE :term)',
                { term: `%${query.toLowerCase()}%` },
            );
        }

        qb = qb.orderBy('admin.createdAt', 'ASC').take(take);

        try {
            const admins = await qb.getMany();

            if (admins.length === 0) {
                return { summary: query ? `No administrators found matching "${query}".` : 'No administrators found.' };
            }

            const lines = admins.map(a => {
                const firstName = (a as any).firstName ?? '';
                const lastName = (a as any).lastName ?? '';
                const email = (a as any).emailAddress ?? '';
                const roles = ((a as any).user?.roles ?? []) as any[];
                const roleNames = roles.map((r: any) => r.code || r.description).join(', ') || 'none';
                const created = a.createdAt ? new Date(a.createdAt).toISOString().split('T')[0] : 'N/A';
                return `- **${firstName} ${lastName}** (ID: ${a.id}) | Email: ${email} | Roles: ${roleNames} | Created: ${created}`;
            });

            return {
                summary: `Found ${admins.length} administrator(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching administrators: ${e}`);
            return { summary: 'Error fetching administrators. Please try again.' };
        }
    }

    async getRoles(
        ctx: RequestContext,
        args: { query?: string; take?: number },
    ): Promise<AdminToolResult> {
        const query = (args.query ?? '').trim();
        const take = Math.min(args.take ?? 20, 50);

        const repo = this.connection.rawConnection.getRepository(Role);

        let qb = repo.createQueryBuilder('role')
            .leftJoinAndSelect('role.channels', 'channel');

        if (query) {
            qb = qb.where('(LOWER(role.code) LIKE :term OR LOWER(role.description) LIKE :term)', {
                term: `%${query.toLowerCase()}%`,
            });
        }

        qb = qb.orderBy('role.code', 'ASC').take(take);

        try {
            const roles = await qb.getMany();

            if (roles.length === 0) {
                return { summary: query ? `No roles found matching "${query}".` : 'No roles found.' };
            }

            const lines = roles.map(r => {
                const code = (r as any).code ?? '';
                const description = (r as any).description ?? '';
                const permissions = ((r as any).permissions ?? []) as string[];
                const channels = ((r as any).channels ?? []).map((c: any) => c.code).join(', ') || 'none';
                const permStr = permissions.length > 0
                    ? (permissions.length <= 5 ? permissions.join(', ') : `${permissions.slice(0, 5).join(', ')} (+${permissions.length - 5} more)`)
                    : 'none';
                return `- **${code}** (ID: ${r.id}) | ${description} | Permissions: ${permStr} | Channels: ${channels}`;
            });

            return {
                summary: `Found ${roles.length} role(s)${query ? ` matching "${query}"` : ''}:\n${lines.join('\n')}`,
            };
        } catch (e) {
            this.logger.error(`Error fetching roles: ${e}`);
            return { summary: 'Error fetching roles. Please try again.' };
        }
    }
}
