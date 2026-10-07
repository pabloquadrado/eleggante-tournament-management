import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class User extends BaseModel {
  @column({ isPrimary: true }) declare id: string
  @column({ serializeAs: null }) declare email: string | null
  @column() declare status: 'active' | 'anonymized'
}
