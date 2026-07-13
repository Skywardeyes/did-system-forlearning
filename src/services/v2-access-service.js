import { AuthorizationError } from '../auth/request-authenticator.js';

export class V2AccessService {
  constructor({ unitOfWork, membershipRepository }) { this.unitOfWork = unitOfWork; this.membershipRepository = membershipRepository; }

  async requireAnyRole(context, allowedRoles) {
    if (!context?.actorId || !context?.tenantId) throw new AuthorizationError('Authenticated actor and tenant context are required');
    const permitted = await this.unitOfWork.run(context, async (operation) => {
      for (const role of allowedRoles) if (await this.membershipRepository.hasRole(operation, role)) return true;
      return false;
    });
    if (!permitted) throw new AuthorizationError();
    return context;
  }
}
