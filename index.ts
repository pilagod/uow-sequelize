import Sequelize from 'sequelize'
import { Uow, UowObject } from 'uow-template'

type SequelizeModel<T> =
  Sequelize.Model<Sequelize.Instance<T>, T>

export type SequelizeUowInstance<T> =
  Sequelize.Instance<T> & UowObject<Sequelize.Transaction>

export type SequelizeUowModel<T> =
  Sequelize.Model<SequelizeUowInstance<T>, T>

export function toUowModel<T> (model: SequelizeModel<T>): SequelizeUowModel<T> {
  Object.assign((model as any).prototype, UowModel.prototype)
  return model as SequelizeUowModel<T>
}

export class UowModel implements UowObject<Sequelize.Transaction> {

  public async createByTx (tx: Sequelize.Transaction) {
    await (this as any as Sequelize.Instance<this>).save({ transaction: tx })
  }

  public async updateByTx (tx: Sequelize.Transaction) {
    await (this as any as Sequelize.Instance<this>).save({ transaction: tx })
  }

  public async deleteByTx (tx: Sequelize.Transaction) {
    await (this as any as Sequelize.Instance<this>).destroy({ transaction: tx })
  }
}

export class UowRepository extends Uow<Sequelize.Transaction> {

  public constructor (
    private sequelize: Sequelize.Sequelize
  ) {
    super()
  }

  protected async begin () {
    return this.sequelize.transaction()
  }

  protected async commit (tx: Sequelize.Transaction) {
    return tx.commit()
  }

  protected async rollback (tx: Sequelize.Transaction) {
    return tx.rollback()
  }
}
