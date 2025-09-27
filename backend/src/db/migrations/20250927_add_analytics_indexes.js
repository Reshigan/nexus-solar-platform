/**
 * Migration to add optimized indexes for analytics queries
 */
exports.up = function(knex) {
  return Promise.all([
    // Add indexes for energy production table
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS energy_production_site_timestamp_idx 
      ON energy_production (site_id, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS energy_production_timestamp_idx 
      ON energy_production (timestamp)
    `),
    
    // Add indexes for energy consumption table
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS energy_consumption_site_timestamp_idx 
      ON energy_consumption (site_id, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS energy_consumption_timestamp_idx 
      ON energy_consumption (timestamp)
    `),
    
    // Add indexes for financial savings table
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS financial_savings_site_timestamp_idx 
      ON financial_savings (site_id, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS financial_savings_timestamp_idx 
      ON financial_savings (timestamp)
    `),
    
    // Add indexes for environmental impact table
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS environmental_impact_site_timestamp_idx 
      ON environmental_impact (site_id, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS environmental_impact_timestamp_idx 
      ON environmental_impact (timestamp)
    `),
    
    // Create materialized views for better performance
    knex.schema.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS site_performance_comparison_mv AS
      SELECT 
        site_id,
        'daily' as interval,
        time_bucket('1 day', timestamp) as timestamp,
        to_char(time_bucket('1 day', timestamp), 'YYYY-MM-DD') as interval_label,
        SUM(production_kwh) as production_kwh,
        AVG(efficiency_pct) as efficiency_pct
      FROM energy_production
      GROUP BY site_id, interval, timestamp, interval_label
      UNION ALL
      SELECT 
        site_id,
        'monthly' as interval,
        time_bucket('1 month', timestamp) as timestamp,
        to_char(time_bucket('1 month', timestamp), 'YYYY-MM') as interval_label,
        SUM(production_kwh) as production_kwh,
        AVG(efficiency_pct) as efficiency_pct
      FROM energy_production
      GROUP BY site_id, interval, timestamp, interval_label
      UNION ALL
      SELECT 
        site_id,
        'yearly' as interval,
        time_bucket('1 year', timestamp) as timestamp,
        to_char(time_bucket('1 year', timestamp), 'YYYY') as interval_label,
        SUM(production_kwh) as production_kwh,
        AVG(efficiency_pct) as efficiency_pct
      FROM energy_production
      GROUP BY site_id, interval, timestamp, interval_label
    `),
    
    knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS site_performance_comparison_mv_idx 
      ON site_performance_comparison_mv (site_id, interval, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS regional_performance_mv AS
      SELECT 
        s.region_code,
        'daily' as interval,
        time_bucket('1 day', ep.timestamp) as timestamp,
        to_char(time_bucket('1 day', ep.timestamp), 'YYYY-MM-DD') as interval_label,
        AVG(ep.production_kwh) as avg_production_kwh,
        AVG(ep.efficiency_pct) as avg_efficiency_pct
      FROM energy_production ep
      JOIN sites s ON ep.site_id = s.id
      GROUP BY s.region_code, interval, timestamp, interval_label
      UNION ALL
      SELECT 
        s.region_code,
        'monthly' as interval,
        time_bucket('1 month', ep.timestamp) as timestamp,
        to_char(time_bucket('1 month', ep.timestamp), 'YYYY-MM') as interval_label,
        AVG(ep.production_kwh) as avg_production_kwh,
        AVG(ep.efficiency_pct) as avg_efficiency_pct
      FROM energy_production ep
      JOIN sites s ON ep.site_id = s.id
      GROUP BY s.region_code, interval, timestamp, interval_label
      UNION ALL
      SELECT 
        s.region_code,
        'yearly' as interval,
        time_bucket('1 year', ep.timestamp) as timestamp,
        to_char(time_bucket('1 year', ep.timestamp), 'YYYY') as interval_label,
        AVG(ep.production_kwh) as avg_production_kwh,
        AVG(ep.efficiency_pct) as avg_efficiency_pct
      FROM energy_production ep
      JOIN sites s ON ep.site_id = s.id
      GROUP BY s.region_code, interval, timestamp, interval_label
    `),
    
    knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS regional_performance_mv_idx 
      ON regional_performance_mv (region_code, interval, timestamp)
    `),
    
    knex.schema.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS site_lifetime_stats AS
      SELECT 
        site_id,
        SUM(production_kwh) as lifetime_production_kwh,
        AVG(efficiency_pct) as avg_lifetime_efficiency_pct
      FROM energy_production
      GROUP BY site_id
    `),
    
    knex.schema.raw(`
      ALTER MATERIALIZED VIEW site_lifetime_stats 
      ADD COLUMN IF NOT EXISTS lifetime_savings_amount DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
      ADD COLUMN IF NOT EXISTS lifetime_co2_avoided_kg DECIMAL(15,2),
      ADD COLUMN IF NOT EXISTS lifetime_trees_equivalent DECIMAL(15,2)
    `),
    
    knex.schema.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS site_lifetime_stats_idx 
      ON site_lifetime_stats (site_id)
    `),
    
    // Create aggregated tables for historical data
    knex.schema.createTable('energy_production_aggregated', function(table) {
      table.uuid('site_id').notNullable();
      table.string('interval', 10).notNullable(); // daily, monthly, yearly
      table.timestamp('timestamp').notNullable();
      table.string('interval_label', 20).notNullable();
      table.decimal('production_kwh', 15, 2).notNullable();
      table.decimal('efficiency_pct', 5, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.primary(['site_id', 'interval', 'timestamp']);
      table.index(['interval', 'timestamp']);
    }),
    
    knex.schema.createTable('energy_consumption_aggregated', function(table) {
      table.uuid('site_id').notNullable();
      table.string('interval', 10).notNullable(); // daily, monthly, yearly
      table.timestamp('timestamp').notNullable();
      table.string('interval_label', 20).notNullable();
      table.decimal('consumption_kwh', 15, 2).notNullable();
      table.decimal('grid_import_kwh', 15, 2).notNullable();
      table.decimal('grid_export_kwh', 15, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.primary(['site_id', 'interval', 'timestamp']);
      table.index(['interval', 'timestamp']);
    }),
    
    knex.schema.createTable('financial_savings_aggregated', function(table) {
      table.uuid('site_id').notNullable();
      table.string('interval', 10).notNullable(); // daily, monthly, yearly
      table.timestamp('timestamp').notNullable();
      table.string('interval_label', 20).notNullable();
      table.decimal('savings_amount', 15, 2).notNullable();
      table.decimal('grid_cost', 15, 2).notNullable();
      table.decimal('solar_value', 15, 2).notNullable();
      table.string('currency', 3).notNullable().defaultTo('ZAR');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.primary(['site_id', 'interval', 'timestamp']);
      table.index(['interval', 'timestamp']);
    }),
    
    knex.schema.createTable('environmental_impact_aggregated', function(table) {
      table.uuid('site_id').notNullable();
      table.string('interval', 10).notNullable(); // daily, monthly, yearly
      table.timestamp('timestamp').notNullable();
      table.string('interval_label', 20).notNullable();
      table.decimal('co2_avoided_kg', 15, 2).notNullable();
      table.decimal('trees_equivalent', 15, 2).notNullable();
      table.decimal('oil_barrels_saved', 15, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.primary(['site_id', 'interval', 'timestamp']);
      table.index(['interval', 'timestamp']);
    }),
    
    // Create table for current site status
    knex.schema.createTable('site_current_status', function(table) {
      table.uuid('site_id').primary();
      table.decimal('current_power_kw', 15, 2).notNullable();
      table.decimal('efficiency_pct', 5, 2).notNullable();
      table.string('status', 20).notNullable();
      table.timestamp('last_updated').notNullable();
      table.jsonb('additional_metrics').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    // Drop indexes
    knex.schema.raw('DROP INDEX IF EXISTS energy_production_site_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS energy_production_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS energy_consumption_site_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS energy_consumption_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS financial_savings_site_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS financial_savings_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS environmental_impact_site_timestamp_idx'),
    knex.schema.raw('DROP INDEX IF EXISTS environmental_impact_timestamp_idx'),
    
    // Drop materialized views
    knex.schema.raw('DROP MATERIALIZED VIEW IF EXISTS site_performance_comparison_mv'),
    knex.schema.raw('DROP MATERIALIZED VIEW IF EXISTS regional_performance_mv'),
    knex.schema.raw('DROP MATERIALIZED VIEW IF EXISTS site_lifetime_stats'),
    
    // Drop aggregated tables
    knex.schema.dropTableIfExists('energy_production_aggregated'),
    knex.schema.dropTableIfExists('energy_consumption_aggregated'),
    knex.schema.dropTableIfExists('financial_savings_aggregated'),
    knex.schema.dropTableIfExists('environmental_impact_aggregated'),
    knex.schema.dropTableIfExists('site_current_status')
  ]);
};