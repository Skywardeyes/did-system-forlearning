export class RepositoryConflictError extends Error {
  constructor(message = 'The record was changed by another request') {
    super(message);
    this.name = 'RepositoryConflictError';
    this.code = 'REPOSITORY_CONFLICT';
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(message = 'The requested record does not exist') {
    super(message);
    this.name = 'RepositoryNotFoundError';
    this.code = 'REPOSITORY_NOT_FOUND';
  }
}

export function requireTenantContext(context) {
  if (!context?.tenantId) {
    const error = new Error('A tenant-scoped repository operation requires context.tenantId');
    error.code = 'TENANT_CONTEXT_REQUIRED';
    throw error;
  }
  return context;
}
