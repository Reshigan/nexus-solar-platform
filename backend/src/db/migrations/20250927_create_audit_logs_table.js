/**
 * Migration to create audit logs table
 */
exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    table.uuid('id').primary();
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.uuid('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
    table.string('action', 50).notNullable();
    table.string('resource_type', 50).nullable();
    table.string('resource_id', 50).nullable();
    table.string('request_method', 20).nullable();
    table.string('request_path', 255).nullable();
    table.jsonb('request_params').nullable();
    table.jsonb('request_body').nullable();
    table.integer('response_status').nullable();
    table.jsonb('response_body').nullable();
    table.string('ip_address', 50).nullable();
    table.string('user_agent', 255).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    // Indexes for efficient querying
    table.index('user_id');
    table.index('tenant_id');
    table.index('action');
    table.index(['resource_type', 'resource_id']);
    table.index('created_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};