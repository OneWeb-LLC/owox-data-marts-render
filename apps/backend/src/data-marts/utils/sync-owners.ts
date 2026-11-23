import { BadRequestException } from '@nestjs/common';
import { Repository, ObjectLiteral } from 'typeorm';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

export async function syncOwners<T extends ObjectLiteral>(
  repository: Repository<T>,
  entityIdField: string & keyof T,
  entityId: string,
  projectId: string,
  ownerIds: string[],
  idpProjectionsFacade: IdpProjectionsFacade,
  createOwner: (userId: string) => T
): Promise<void> {
  const uniqueOwnerIds = [...new Set(ownerIds)];

  if (uniqueOwnerIds.length > 0) {
    const members = await idpProjectionsFacade.getProjectMembers(projectId);
    const memberIds = new Set(members.filter(m => !m.isOutbound).map(m => m.userId));
    const invalidIds = uniqueOwnerIds.filter(id => !memberIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        invalidIds.length === 1
          ? 'The selected owner is not a member of this project. Choose a current member, or clear Ownership.'
          : 'Some selected owners are not members of this project. Choose current members, or clear Ownership.'
      );
    }
  }

  await repository.delete({ [entityIdField]: entityId } as T);
  const owners = uniqueOwnerIds.map(createOwner);
  if (owners.length > 0) {
    await repository.save(owners);
  }
}
