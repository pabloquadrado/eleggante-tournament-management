import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema
      .raw(`CREATE OR REPLACE FUNCTION preserve_arena_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.arena_number IS DISTINCT FROM OLD.arena_number THEN
          RAISE EXCEPTION 'Arena Eleggante ID is immutable';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER preserve_arena_identity BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION preserve_arena_identity()`)
  }

  async down() {
    this.schema.raw(
      'DROP TRIGGER preserve_arena_identity ON users; DROP FUNCTION preserve_arena_identity()'
    )
  }
}
