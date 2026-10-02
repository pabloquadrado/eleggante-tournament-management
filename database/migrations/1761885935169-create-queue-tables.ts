import { BaseSchema } from '@adonisjs/lucid/schema'
import { QueueSchemaService } from '@adonisjs/queue'

export default class extends BaseSchema {
  async up() {
    const schema = new QueueSchemaService(this.db.getWriteClient())
    await schema.createJobsTable()
    await schema.createSchedulesTable()
  }

  async down() {
    const schema = new QueueSchemaService(this.db.getWriteClient())
    await schema.dropSchedulesTable()
    await schema.dropJobsTable()
  }
}
