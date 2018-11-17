import Sequelize from 'sequelize'
import sinon from 'sinon'
import {
  SequelizeUowInstance,
  SequelizeUowModel,
  toUowModel,
  UowModel,
  UowRepository
} from './index'

type SequelizeModel<T> =
  Sequelize.Model<Sequelize.Instance<T>, T>

type TestModel = {
  id: number;
  name: string;
}

class TestRepository extends UowRepository {

  public constructor (sequelize: Sequelize.Sequelize) {
    super(sequelize)
  }

  public async create (instance: SequelizeUowInstance<TestModel>) {
    await this.markCreate(instance)
  }

  public async update (instance: SequelizeUowInstance<TestModel>) {
    await this.markUpdate(instance)
  }

  public async delete (instance: SequelizeUowInstance<TestModel>) {
    await this.markDelete(instance)
  }
}

describe('uow sequelize', () => {
  let sequelize: Sequelize.Sequelize
  let testModel: SequelizeUowModel<TestModel>

  beforeAll(async () => {
    sequelize = new Sequelize({
      dialect: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'test',
      password: 'test',
      database: 'test',
      logging: false,
      sync: {
        force: true
      }
    })
    testModel = toUowModel(sequelize.define('test', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      }
    }, {
      timestamps: false
    }) as SequelizeModel<TestModel>)
    await testModel.sync()
  })

  afterAll(async () => {
    await testModel.drop()
    await sequelize.close()
  })

  beforeEach(async () => {
    await testModel.truncate()
  })

  function getTestRepository () {
    return new TestRepository(sequelize)
  }

  function getTestModel (id: number, name: string) {
    return testModel.build({ id, name })
  }

  function getPlain <T> (instance: Sequelize.Instance<T>): T {
    return instance.get({ plain: true })
  }

  describe('without beginWork declaration', () => {
    it('should create entity properly', async () => {
      const repository = getTestRepository()
      const expected = getTestModel(1, 'test')

      await repository.create(expected)

      const got = await testModel.findById(1)

      expect(getPlain(got!)).toEqual(getPlain(expected))
    })

    it('should update entity properly', async () => {
      const repository = getTestRepository()
      const original = getTestModel(1, 'test')
      const expected = getTestModel(1, 'update successfully')

      expected.isNewRecord = false

      await original.save()
      await repository.update(expected)

      const got = await testModel.findById(1)

      expect(getPlain(got!)).toEqual(getPlain(expected))
    })

    it('should delete entity properly', async () => {
      const repository = getTestRepository()
      const original = getTestModel(1, 'test')

      await original.save()
      await repository.delete(original)

      const got = await testModel.findById(1)

      expect(got).toBeNull()
    })
  })

  describe('with beginWork declaration', () => {
    it('should do all actions in one transaction after beginWork declaration', async () => {
      const repository = getTestRepository()
      const model1 = getTestModel(1, 'first')
      const model2 = getTestModel(2, 'second')
      const model2Update = getTestModel(2, 'update')
      const model3 = getTestModel(3, 'third')

      model2Update.isNewRecord = false

      await model2.save()
      await model3.save()

      repository.beginWork()
      await repository.create(model1)
      await repository.update(model2Update)
      await repository.delete(model3)

      const model1Before = await testModel.findById(1)
      const model2Before = await testModel.findById(2)
      const model3Before = await testModel.findById(3)

      expect(model1Before).toBeNull()
      expect(getPlain(model2Before!)).toEqual(getPlain(model2))
      expect(getPlain(model3Before!)).toEqual(getPlain(model3))

      await repository.commitWork()

      const model1After = await testModel.findById(1)
      const model2After = await testModel.findById(2)
      const model3After = await testModel.findById(3)

      expect(getPlain(model1After!)).toEqual(getPlain(model1))
      expect(getPlain(model2After!)).toEqual(getPlain(model2Update))
      expect(model3After).toBeNull()
    })

    it('should rollback all actions if any error occurs after beginWork declaration', async () => {
      const repository = getTestRepository()
      const model1 = getTestModel(1, 'first')
      const model2 = getTestModel(2, 'second')
      const model2Update = getTestModel(2, 'update')
      const model3 = getTestModel(3, 'third')

      model2Update.isNewRecord = false

      sinon.stub(model3, 'deleteByTx').throws(
        new Error('delete model error')
      )
      await model2.save()
      await model3.save()

      const modelsBefore = await testModel.find()

      repository.beginWork()
      await repository.create(model1)
      await repository.update(model2Update)
      await repository.delete(model3)
      try {
        await repository.commitWork()
      } catch (e) {
        // catch error to keep test going
      }
      const modelsAfter = await testModel.find()

      expect(modelsAfter).toEqual(modelsBefore)
    })
  })
})
