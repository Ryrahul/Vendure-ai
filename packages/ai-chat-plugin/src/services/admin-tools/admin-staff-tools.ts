import { Logger } from '@nestjs/common';
import {
    RequestContext,
    TransactionalConnection,
    Administrator,
    Role,
    AdministratorService,
    RoleService,
    Permission,
} from '@vendure/core';

interface AdminToolResult {
    summary: string;
}

export class AdminStaffTools {
    private readonly logger = new Logger(AdminStaffTools.name);

    constructor(
        private connection: TransactionalConnection,
        private administratorService: AdministratorService,
        private roleService: RoleService,
    ) {}

    // ─── Read operations ────────────────────────────────────────────────

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

    // ─── Administrator mutations ────────────────────────────────────────

    async createAdministrator(
        ctx: RequestContext,
        args: {
            firstName: string;
            lastName: string;
            emailAddress: string;
            password: string;
            roleIds: string[];
        },
    ): Promise<AdminToolResult> {
        try {
            const input = {
                firstName: args.firstName,
                lastName: args.lastName,
                emailAddress: args.emailAddress,
                password: args.password,
                roleIds: args.roleIds,
            };

            const result = await this.administratorService.create(ctx, input);

            const firstName = (result as any).firstName ?? '';
            const lastName = (result as any).lastName ?? '';
            return { summary: `Administrator "${firstName} ${lastName}" created successfully (ID: ${result.id}).` };
        } catch (e) {
            this.logger.error(`Error creating administrator: ${e}`);
            return { summary: `Error creating administrator: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async updateAdministrator(
        ctx: RequestContext,
        args: {
            administratorId: string;
            firstName?: string;
            lastName?: string;
            emailAddress?: string;
            password?: string;
            roleIds?: string[];
        },
    ): Promise<AdminToolResult> {
        try {
            const input: any = {
                id: args.administratorId,
            };

            if (args.firstName !== undefined) input.firstName = args.firstName;
            if (args.lastName !== undefined) input.lastName = args.lastName;
            if (args.emailAddress !== undefined) input.emailAddress = args.emailAddress;
            if (args.password !== undefined) input.password = args.password;
            if (args.roleIds !== undefined) input.roleIds = args.roleIds;

            const result = await this.administratorService.update(ctx, input);

            const firstName = (result as any).firstName ?? '';
            const lastName = (result as any).lastName ?? '';
            return { summary: `Administrator "${firstName} ${lastName}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating administrator: ${e}`);
            return { summary: `Error updating administrator: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteAdministrator(
        ctx: RequestContext,
        args: { administratorId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.administratorService.softDelete(ctx, args.administratorId);

            if (result.result === 'DELETED') {
                return { summary: `Administrator (ID: ${args.administratorId}) deleted successfully.` };
            }

            return { summary: `Failed to delete administrator (ID: ${args.administratorId}).` };
        } catch (e) {
            this.logger.error(`Error deleting administrator: ${e}`);
            return { summary: `Error deleting administrator: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    // ─── Role mutations ─────────────────────────────────────────────────

    async createRole(
        ctx: RequestContext,
        args: {
            code: string;
            description: string;
            permissions: string[];
            channelIds?: string[];
        },
    ): Promise<AdminToolResult> {
        const validPermissions = Object.values(Permission);
        const validated: Permission[] = [];
        const invalid: string[] = [];

        for (const p of args.permissions) {
            if (validPermissions.includes(p as Permission)) {
                validated.push(p as Permission);
            } else {
                invalid.push(p);
            }
        }

        if (invalid.length > 0) {
            return {
                summary: `Invalid permission(s): ${invalid.join(', ')}. Valid permissions are: ${validPermissions.join(', ')}`,
            };
        }

        try {
            const result = await this.roleService.create(ctx, {
                code: args.code,
                description: args.description,
                permissions: validated,
                channelIds: args.channelIds,
            });

            const code = (result as any).code ?? args.code;
            return { summary: `Role "${code}" created successfully (ID: ${result.id}) with ${validated.length} permission(s): ${validated.join(', ')}.` };
        } catch (e) {
            this.logger.error(`Error creating role: ${e}`);
            return { summary: `Error creating role: ${e instanceof Error ? e.message : 'Unknown error'}. Valid permissions are: ${validPermissions.join(', ')}` };
        }
    }

    async updateRole(
        ctx: RequestContext,
        args: {
            roleId: string;
            code?: string;
            description?: string;
            permissions?: string[];
            channelIds?: string[];
        },
    ): Promise<AdminToolResult> {
        if (args.permissions) {
            const validPermissions = Object.values(Permission);
            const invalid = args.permissions.filter(p => !validPermissions.includes(p as Permission));
            if (invalid.length > 0) {
                return {
                    summary: `Invalid permission(s): ${invalid.join(', ')}. Valid permissions are: ${validPermissions.join(', ')}`,
                };
            }
        }

        try {
            const input: any = { id: args.roleId };
            if (args.code !== undefined) input.code = args.code;
            if (args.description !== undefined) input.description = args.description;
            if (args.permissions !== undefined) input.permissions = args.permissions as Permission[];
            if (args.channelIds !== undefined) input.channelIds = args.channelIds;

            const result = await this.roleService.update(ctx, input);

            const code = (result as any).code ?? '';
            return { summary: `Role "${code}" (ID: ${result.id}) updated successfully.` };
        } catch (e) {
            this.logger.error(`Error updating role: ${e}`);
            return { summary: `Error updating role: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }

    async deleteRole(
        ctx: RequestContext,
        args: { roleId: string },
    ): Promise<AdminToolResult> {
        try {
            const result = await this.roleService.delete(ctx, args.roleId);

            if (result.result === 'DELETED') {
                return { summary: `Role (ID: ${args.roleId}) deleted successfully.` };
            }

            return { summary: `Failed to delete role (ID: ${args.roleId}): ${result.message ?? 'Unknown error'}` };
        } catch (e) {
            this.logger.error(`Error deleting role: ${e}`);
            return { summary: `Error deleting role: ${e instanceof Error ? e.message : 'Unknown error'}` };
        }
    }
}
