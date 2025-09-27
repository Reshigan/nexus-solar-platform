const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { redisClient } = require('./redis.service');

const logger = createLogger('analytics-service');

/**
 * Service for analytics data processing
 */
class AnalyticsService {
  /**
   * Get energy production data
   * @param {string} siteId - Site ID
   * @param {string} interval - Data interval (hourly, daily, monthly, yearly)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Production data
   */
  async getEnergyProduction(siteId, interval = 'daily', startDate, endDate) {
    logger.info(`Getting ${interval} energy production for site ${siteId} from ${startDate} to ${endDate}`);
    
    // Validate date range
    if (new Date(endDate) - new Date(startDate) > 366 * 24 * 60 * 60 * 1000) {
      logger.warn(`Large date range requested for site ${siteId}: ${startDate} to ${endDate}`);
    }
    
    // Generate cache key
    const cacheKey = `analytics:production:${siteId}:${interval}:${startDate}:${endDate}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached production data for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Determine time bucket based on interval
    let timeBucket;
    let timeFormat;
    
    switch (interval) {
      case 'hourly':
        timeBucket = 'hour';
        timeFormat = 'YYYY-MM-DD HH24:00:00';
        break;
      case 'daily':
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
        break;
      case 'monthly':
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
        break;
      case 'yearly':
        timeBucket = 'year';
        timeFormat = 'YYYY';
        break;
      default:
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
    }
    
    // For large date ranges, use pre-aggregated data if available
    let query;
    const dateRange = new Date(endDate) - new Date(startDate);
    const isLargeRange = dateRange > 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (isLargeRange && (interval === 'daily' || interval === 'monthly' || interval === 'yearly')) {
      // Use pre-aggregated data for better performance
      query = db('energy_production_aggregated')
        .where('site_id', siteId)
        .where('interval', interval)
        .whereBetween('timestamp', [startDate, endDate])
        .orderBy('timestamp', 'asc');
    } else {
      // Use time-bucket for aggregation
      query = db('energy_production')
        .select(
          db.raw(`time_bucket('1 ${timeBucket}', timestamp) as time_bucket`),
          db.raw('to_char(time_bucket(\'1 ' + timeBucket + '\', timestamp), \'' + timeFormat + '\') as time_period'),
          db.raw('SUM(production_kwh) as production_kwh'),
          db.raw('AVG(efficiency_pct) as efficiency_pct')
        )
        .where('site_id', siteId)
        .whereBetween('timestamp', [startDate, endDate])
        .groupBy('time_bucket')
        .orderBy('time_bucket', 'asc');
      
      // Add index hint for large queries
      if (isLargeRange) {
        query.hint('energy_production_site_timestamp_idx');
      }
    }
    
    // Execute query with timeout for large ranges
    const queryTimeout = isLargeRange ? 30000 : 10000; // 30 seconds for large ranges, 10 seconds otherwise
    const productionData = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
      )
    ]);
    
    // Transform data
    const result = productionData.map(row => ({
      timestamp: row.time_bucket || row.timestamp,
      timePeriod: row.time_period || row.interval_label,
      productionKwh: parseFloat(row.production_kwh),
      efficiencyPct: parseFloat(row.efficiency_pct)
    }));
    
    // Cache the result (shorter TTL for hourly data, longer for aggregated data)
    const cacheTTL = interval === 'hourly' ? 300 : 3600; // 5 minutes for hourly, 1 hour for others
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL);
    
    logger.info(`Retrieved ${result.length} ${interval} production records for site ${siteId}`);
    return result;
  }
  
  /**
   * Get energy consumption data
   * @param {string} siteId - Site ID
   * @param {string} interval - Data interval (hourly, daily, monthly, yearly)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Consumption data
   */
  async getEnergyConsumption(siteId, interval = 'daily', startDate, endDate) {
    logger.info(`Getting ${interval} energy consumption for site ${siteId} from ${startDate} to ${endDate}`);
    
    // Validate date range
    if (new Date(endDate) - new Date(startDate) > 366 * 24 * 60 * 60 * 1000) {
      logger.warn(`Large date range requested for site ${siteId}: ${startDate} to ${endDate}`);
    }
    
    // Generate cache key
    const cacheKey = `analytics:consumption:${siteId}:${interval}:${startDate}:${endDate}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached consumption data for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Determine time bucket based on interval
    let timeBucket;
    let timeFormat;
    
    switch (interval) {
      case 'hourly':
        timeBucket = 'hour';
        timeFormat = 'YYYY-MM-DD HH24:00:00';
        break;
      case 'daily':
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
        break;
      case 'monthly':
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
        break;
      case 'yearly':
        timeBucket = 'year';
        timeFormat = 'YYYY';
        break;
      default:
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
    }
    
    // For large date ranges, use pre-aggregated data if available
    let query;
    const dateRange = new Date(endDate) - new Date(startDate);
    const isLargeRange = dateRange > 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (isLargeRange && (interval === 'daily' || interval === 'monthly' || interval === 'yearly')) {
      // Use pre-aggregated data for better performance
      query = db('energy_consumption_aggregated')
        .where('site_id', siteId)
        .where('interval', interval)
        .whereBetween('timestamp', [startDate, endDate])
        .orderBy('timestamp', 'asc');
    } else {
      // Use time-bucket for aggregation
      query = db('energy_consumption')
        .select(
          db.raw(`time_bucket('1 ${timeBucket}', timestamp) as time_bucket`),
          db.raw('to_char(time_bucket(\'1 ' + timeBucket + '\', timestamp), \'' + timeFormat + '\') as time_period'),
          db.raw('SUM(consumption_kwh) as consumption_kwh'),
          db.raw('SUM(grid_import_kwh) as grid_import_kwh'),
          db.raw('SUM(grid_export_kwh) as grid_export_kwh')
        )
        .where('site_id', siteId)
        .whereBetween('timestamp', [startDate, endDate])
        .groupBy('time_bucket')
        .orderBy('time_bucket', 'asc');
      
      // Add index hint for large queries
      if (isLargeRange) {
        query.hint('energy_consumption_site_timestamp_idx');
      }
    }
    
    // Execute query with timeout for large ranges
    const queryTimeout = isLargeRange ? 30000 : 10000; // 30 seconds for large ranges, 10 seconds otherwise
    const consumptionData = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
      )
    ]);
    
    // Transform data
    const result = consumptionData.map(row => ({
      timestamp: row.time_bucket || row.timestamp,
      timePeriod: row.time_period || row.interval_label,
      consumptionKwh: parseFloat(row.consumption_kwh),
      gridImportKwh: parseFloat(row.grid_import_kwh),
      gridExportKwh: parseFloat(row.grid_export_kwh),
      selfConsumptionKwh: parseFloat(row.consumption_kwh) - parseFloat(row.grid_import_kwh)
    }));
    
    // Cache the result (shorter TTL for hourly data, longer for aggregated data)
    const cacheTTL = interval === 'hourly' ? 300 : 3600; // 5 minutes for hourly, 1 hour for others
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL);
    
    logger.info(`Retrieved ${result.length} ${interval} consumption records for site ${siteId}`);
    return result;
  }
  
  /**
   * Get financial savings data
   * @param {string} siteId - Site ID
   * @param {string} interval - Data interval (daily, monthly, yearly)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Savings data
   */
  async getFinancialSavings(siteId, interval = 'monthly', startDate, endDate) {
    logger.info(`Getting ${interval} financial savings for site ${siteId} from ${startDate} to ${endDate}`);
    
    // Generate cache key
    const cacheKey = `analytics:savings:${siteId}:${interval}:${startDate}:${endDate}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached savings data for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Determine time bucket based on interval
    let timeBucket;
    let timeFormat;
    
    switch (interval) {
      case 'daily':
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
        break;
      case 'monthly':
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
        break;
      case 'yearly':
        timeBucket = 'year';
        timeFormat = 'YYYY';
        break;
      default:
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
    }
    
    // For large date ranges, use pre-aggregated data if available
    let query;
    const dateRange = new Date(endDate) - new Date(startDate);
    const isLargeRange = dateRange > 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (isLargeRange && (interval === 'monthly' || interval === 'yearly')) {
      // Use pre-aggregated data for better performance
      query = db('financial_savings_aggregated')
        .where('site_id', siteId)
        .where('interval', interval)
        .whereBetween('timestamp', [startDate, endDate])
        .orderBy('timestamp', 'asc');
    } else {
      // Use time-bucket for aggregation
      query = db('financial_savings')
        .select(
          db.raw(`time_bucket('1 ${timeBucket}', timestamp) as time_bucket`),
          db.raw('to_char(time_bucket(\'1 ' + timeBucket + '\', timestamp), \'' + timeFormat + '\') as time_period'),
          db.raw('SUM(savings_amount) as savings_amount'),
          db.raw('SUM(grid_cost) as grid_cost'),
          db.raw('SUM(solar_value) as solar_value'),
          'currency'
        )
        .where('site_id', siteId)
        .whereBetween('timestamp', [startDate, endDate])
        .groupBy(['time_bucket', 'currency'])
        .orderBy('time_bucket', 'asc');
      
      // Add index hint for large queries
      if (isLargeRange) {
        query.hint('financial_savings_site_timestamp_idx');
      }
    }
    
    // Execute query with timeout for large ranges
    const queryTimeout = isLargeRange ? 30000 : 10000; // 30 seconds for large ranges, 10 seconds otherwise
    const savingsData = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
      )
    ]);
    
    // Transform data
    const result = savingsData.map(row => ({
      timestamp: row.time_bucket || row.timestamp,
      timePeriod: row.time_period || row.interval_label,
      savingsAmount: parseFloat(row.savings_amount),
      gridCost: parseFloat(row.grid_cost),
      solarValue: parseFloat(row.solar_value),
      currency: row.currency
    }));
    
    // Cache the result
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600); // 1 hour
    
    logger.info(`Retrieved ${result.length} ${interval} savings records for site ${siteId}`);
    return result;
  }
  
  /**
   * Get environmental impact data
   * @param {string} siteId - Site ID
   * @param {string} interval - Data interval (daily, monthly, yearly)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Environmental impact data
   */
  async getEnvironmentalImpact(siteId, interval = 'monthly', startDate, endDate) {
    logger.info(`Getting ${interval} environmental impact for site ${siteId} from ${startDate} to ${endDate}`);
    
    // Generate cache key
    const cacheKey = `analytics:environmental:${siteId}:${interval}:${startDate}:${endDate}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached environmental impact data for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Determine time bucket based on interval
    let timeBucket;
    let timeFormat;
    
    switch (interval) {
      case 'daily':
        timeBucket = 'day';
        timeFormat = 'YYYY-MM-DD';
        break;
      case 'monthly':
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
        break;
      case 'yearly':
        timeBucket = 'year';
        timeFormat = 'YYYY';
        break;
      default:
        timeBucket = 'month';
        timeFormat = 'YYYY-MM';
    }
    
    // For large date ranges, use pre-aggregated data if available
    let query;
    const dateRange = new Date(endDate) - new Date(startDate);
    const isLargeRange = dateRange > 90 * 24 * 60 * 60 * 1000; // 90 days
    
    if (isLargeRange && (interval === 'monthly' || interval === 'yearly')) {
      // Use pre-aggregated data for better performance
      query = db('environmental_impact_aggregated')
        .where('site_id', siteId)
        .where('interval', interval)
        .whereBetween('timestamp', [startDate, endDate])
        .orderBy('timestamp', 'asc');
    } else {
      // Use time-bucket for aggregation
      query = db('environmental_impact')
        .select(
          db.raw(`time_bucket('1 ${timeBucket}', timestamp) as time_bucket`),
          db.raw('to_char(time_bucket(\'1 ' + timeBucket + '\', timestamp), \'' + timeFormat + '\') as time_period'),
          db.raw('SUM(co2_avoided_kg) as co2_avoided_kg'),
          db.raw('SUM(trees_equivalent) as trees_equivalent'),
          db.raw('SUM(oil_barrels_saved) as oil_barrels_saved')
        )
        .where('site_id', siteId)
        .whereBetween('timestamp', [startDate, endDate])
        .groupBy('time_bucket')
        .orderBy('time_bucket', 'asc');
      
      // Add index hint for large queries
      if (isLargeRange) {
        query.hint('environmental_impact_site_timestamp_idx');
      }
    }
    
    // Execute query with timeout for large ranges
    const queryTimeout = isLargeRange ? 30000 : 10000; // 30 seconds for large ranges, 10 seconds otherwise
    const impactData = await Promise.race([
      query,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), queryTimeout)
      )
    ]);
    
    // Transform data
    const result = impactData.map(row => ({
      timestamp: row.time_bucket || row.timestamp,
      timePeriod: row.time_period || row.interval_label,
      co2AvoidedKg: parseFloat(row.co2_avoided_kg),
      treesEquivalent: parseFloat(row.trees_equivalent),
      oilBarrelsSaved: parseFloat(row.oil_barrels_saved)
    }));
    
    // Cache the result
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600); // 1 hour
    
    logger.info(`Retrieved ${result.length} ${interval} environmental impact records for site ${siteId}`);
    return result;
  }
  
  /**
   * Get performance comparison data
   * @param {string} siteId - Site ID
   * @param {string} comparisonType - Comparison type (similar_sites, regional, expected)
   * @param {string} interval - Data interval (daily, monthly, yearly)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Comparison data
   */
  async getPerformanceComparison(siteId, comparisonType = 'similar_sites', interval = 'monthly', startDate, endDate) {
    logger.info(`Getting ${comparisonType} performance comparison for site ${siteId} from ${startDate} to ${endDate}`);
    
    // Generate cache key
    const cacheKey = `analytics:comparison:${siteId}:${comparisonType}:${interval}:${startDate}:${endDate}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached comparison data for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Get site details
    const site = await db('sites')
      .where('id', siteId)
      .first();
    
    if (!site) {
      throw new NotFoundError('Site not found');
    }
    
    // Get site's production data
    const siteProduction = await this.getEnergyProduction(siteId, interval, startDate, endDate);
    
    let comparisonData;
    
    switch (comparisonType) {
      case 'similar_sites':
        // Get similar sites based on capacity, location, and installation type
        const similarSites = await db('sites')
          .whereNot('id', siteId)
          .where('tenant_id', site.tenant_id)
          .whereBetween('capacity_kw', [site.capacity_kw * 0.8, site.capacity_kw * 1.2])
          .where('installation_type', site.installation_type)
          .whereRaw('ST_DWithin(location, ST_SetSRID(ST_MakePoint(?, ?), 4326), 50000)', [site.longitude, site.latitude])
          .limit(10);
        
        if (similarSites.length === 0) {
          throw new BadRequestError('No similar sites found for comparison');
        }
        
        // Get production data for similar sites
        const similarSiteIds = similarSites.map(s => s.id);
        
        // Use materialized view for better performance with large date ranges
        const dateRange = new Date(endDate) - new Date(startDate);
        const isLargeRange = dateRange > 90 * 24 * 60 * 60 * 1000; // 90 days
        
        let similarSitesQuery;
        if (isLargeRange) {
          similarSitesQuery = db('site_performance_comparison_mv')
            .whereIn('site_id', similarSiteIds)
            .where('interval', interval)
            .whereBetween('timestamp', [startDate, endDate])
            .select(
              'timestamp',
              'interval_label as time_period',
              db.raw('AVG(production_kwh) as avg_production_kwh'),
              db.raw('AVG(efficiency_pct) as avg_efficiency_pct'),
              db.raw('MAX(production_kwh) as max_production_kwh'),
              db.raw('MIN(production_kwh) as min_production_kwh')
            )
            .groupBy('timestamp', 'interval_label')
            .orderBy('timestamp', 'asc');
        } else {
          // Determine time bucket based on interval
          let timeBucket;
          let timeFormat;
          
          switch (interval) {
            case 'daily':
              timeBucket = 'day';
              timeFormat = 'YYYY-MM-DD';
              break;
            case 'monthly':
              timeBucket = 'month';
              timeFormat = 'YYYY-MM';
              break;
            case 'yearly':
              timeBucket = 'year';
              timeFormat = 'YYYY';
              break;
            default:
              timeBucket = 'month';
              timeFormat = 'YYYY-MM';
          }
          
          similarSitesQuery = db('energy_production')
            .whereIn('site_id', similarSiteIds)
            .whereBetween('timestamp', [startDate, endDate])
            .select(
              db.raw(`time_bucket('1 ${timeBucket}', timestamp) as time_bucket`),
              db.raw('to_char(time_bucket(\'1 ' + timeBucket + '\', timestamp), \'' + timeFormat + '\') as time_period'),
              db.raw('AVG(production_kwh) as avg_production_kwh'),
              db.raw('AVG(efficiency_pct) as avg_efficiency_pct'),
              db.raw('MAX(production_kwh) as max_production_kwh'),
              db.raw('MIN(production_kwh) as min_production_kwh')
            )
            .groupBy('time_bucket')
            .orderBy('time_bucket', 'asc');
        }
        
        const similarSitesProduction = await similarSitesQuery;
        
        // Combine site data with comparison data
        comparisonData = {
          site: {
            id: siteId,
            name: site.name,
            data: siteProduction
          },
          comparison: {
            type: 'similar_sites',
            count: similarSites.length,
            data: similarSitesProduction.map(row => ({
              timestamp: row.time_bucket || row.timestamp,
              timePeriod: row.time_period,
              avgProductionKwh: parseFloat(row.avg_production_kwh),
              avgEfficiencyPct: parseFloat(row.avg_efficiency_pct),
              maxProductionKwh: parseFloat(row.max_production_kwh),
              minProductionKwh: parseFloat(row.min_production_kwh)
            }))
          }
        };
        break;
      
      case 'regional':
        // Get regional average based on location
        // Use materialized view for better performance
        const regionalData = await db('regional_performance_mv')
          .where('region_code', site.region_code)
          .where('interval', interval)
          .whereBetween('timestamp', [startDate, endDate])
          .orderBy('timestamp', 'asc');
        
        comparisonData = {
          site: {
            id: siteId,
            name: site.name,
            data: siteProduction
          },
          comparison: {
            type: 'regional',
            region: site.region_code,
            data: regionalData.map(row => ({
              timestamp: row.timestamp,
              timePeriod: row.interval_label,
              avgProductionKwh: parseFloat(row.avg_production_kwh),
              avgEfficiencyPct: parseFloat(row.avg_efficiency_pct)
            }))
          }
        };
        break;
      
      case 'expected':
        // Get expected production based on site specifications
        const expectedData = await db('expected_production')
          .where('site_id', siteId)
          .where('interval', interval)
          .whereBetween('timestamp', [startDate, endDate])
          .orderBy('timestamp', 'asc');
        
        comparisonData = {
          site: {
            id: siteId,
            name: site.name,
            data: siteProduction
          },
          comparison: {
            type: 'expected',
            data: expectedData.map(row => ({
              timestamp: row.timestamp,
              timePeriod: row.interval_label,
              expectedProductionKwh: parseFloat(row.expected_production_kwh),
              expectedEfficiencyPct: parseFloat(row.expected_efficiency_pct),
              variancePct: parseFloat(row.variance_pct)
            }))
          }
        };
        break;
      
      default:
        throw new BadRequestError('Invalid comparison type');
    }
    
    // Cache the result
    await redisClient.set(cacheKey, JSON.stringify(comparisonData), 'EX', 3600); // 1 hour
    
    logger.info(`Retrieved performance comparison data for site ${siteId}`);
    return comparisonData;
  }
  
  /**
   * Get site analytics summary
   * @param {string} siteId - Site ID
   * @returns {Promise<Object>} Analytics summary
   */
  async getSiteAnalyticsSummary(siteId) {
    logger.info(`Getting analytics summary for site ${siteId}`);
    
    // Generate cache key
    const cacheKey = `analytics:summary:${siteId}`;
    
    // Try to get from cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Returning cached analytics summary for site ${siteId}`);
      return JSON.parse(cachedData);
    }
    
    // Get site details
    const site = await db('sites')
      .where('id', siteId)
      .first();
    
    if (!site) {
      throw new NotFoundError('Site not found');
    }
    
    // Get current date and previous periods
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const prevYearStart = new Date(yearStart);
    prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
    
    // Get production data
    const [
      todayProduction,
      yesterdayProduction,
      monthProduction,
      prevMonthProduction,
      yearProduction,
      prevYearProduction,
      lifetimeProduction
    ] = await Promise.all([
      // Today's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', todayStart)
        .sum('production_kwh as total')
        .first(),
      
      // Yesterday's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', yesterdayStart)
        .where('timestamp', '<', todayStart)
        .sum('production_kwh as total')
        .first(),
      
      // This month's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', monthStart)
        .sum('production_kwh as total')
        .first(),
      
      // Previous month's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', prevMonthStart)
        .where('timestamp', '<', monthStart)
        .sum('production_kwh as total')
        .first(),
      
      // This year's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', yearStart)
        .sum('production_kwh as total')
        .first(),
      
      // Previous year's production
      db('energy_production')
        .where('site_id', siteId)
        .where('timestamp', '>=', prevYearStart)
        .where('timestamp', '<', yearStart)
        .sum('production_kwh as total')
        .first(),
      
      // Lifetime production (use aggregated data for better performance)
      db('site_lifetime_stats')
        .where('site_id', siteId)
        .select('lifetime_production_kwh')
        .first()
    ]);
    
    // Get financial data
    const [
      monthSavings,
      prevMonthSavings,
      yearSavings,
      prevYearSavings,
      lifetimeSavings
    ] = await Promise.all([
      // This month's savings
      db('financial_savings')
        .where('site_id', siteId)
        .where('timestamp', '>=', monthStart)
        .sum('savings_amount as total')
        .first(),
      
      // Previous month's savings
      db('financial_savings')
        .where('site_id', siteId)
        .where('timestamp', '>=', prevMonthStart)
        .where('timestamp', '<', monthStart)
        .sum('savings_amount as total')
        .first(),
      
      // This year's savings
      db('financial_savings')
        .where('site_id', siteId)
        .where('timestamp', '>=', yearStart)
        .sum('savings_amount as total')
        .first(),
      
      // Previous year's savings
      db('financial_savings')
        .where('site_id', siteId)
        .where('timestamp', '>=', prevYearStart)
        .where('timestamp', '<', yearStart)
        .sum('savings_amount as total')
        .first(),
      
      // Lifetime savings (use aggregated data for better performance)
      db('site_lifetime_stats')
        .where('site_id', siteId)
        .select('lifetime_savings_amount', 'currency')
        .first()
    ]);
    
    // Get environmental impact data
    const environmentalImpact = await db('site_lifetime_stats')
      .where('site_id', siteId)
      .select('lifetime_co2_avoided_kg', 'lifetime_trees_equivalent')
      .first();
    
    // Get current performance metrics
    const currentPerformance = await db('site_current_status')
      .where('site_id', siteId)
      .select('current_power_kw', 'efficiency_pct', 'status', 'last_updated')
      .first();
    
    // Compile summary
    const summary = {
      production: {
        current: currentPerformance ? parseFloat(currentPerformance.current_power_kw) : 0,
        today: parseFloat(todayProduction?.total || 0),
        yesterday: parseFloat(yesterdayProduction?.total || 0),
        thisMonth: parseFloat(monthProduction?.total || 0),
        prevMonth: parseFloat(prevMonthProduction?.total || 0),
        thisYear: parseFloat(yearProduction?.total || 0),
        prevYear: parseFloat(prevYearProduction?.total || 0),
        lifetime: parseFloat(lifetimeProduction?.lifetime_production_kwh || 0)
      },
      financial: {
        thisMonth: parseFloat(monthSavings?.total || 0),
        prevMonth: parseFloat(prevMonthSavings?.total || 0),
        thisYear: parseFloat(yearSavings?.total || 0),
        prevYear: parseFloat(prevYearSavings?.total || 0),
        lifetime: parseFloat(lifetimeSavings?.lifetime_savings_amount || 0),
        currency: lifetimeSavings?.currency || 'ZAR'
      },
      environmental: {
        co2Avoided: parseFloat(environmentalImpact?.lifetime_co2_avoided_kg || 0),
        treesEquivalent: parseFloat(environmentalImpact?.lifetime_trees_equivalent || 0)
      },
      performance: {
        currentEfficiency: currentPerformance ? parseFloat(currentPerformance.efficiency_pct) : 0,
        status: currentPerformance?.status || 'unknown',
        lastUpdated: currentPerformance?.last_updated || null
      }
    };
    
    // Cache the result
    await redisClient.set(cacheKey, JSON.stringify(summary), 'EX', 300); // 5 minutes
    
    logger.info(`Retrieved analytics summary for site ${siteId}`);
    return summary;
  }
  
  /**
   * Refresh aggregated analytics data
   * This method should be called periodically to update pre-aggregated data
   * @returns {Promise<Object>} Refresh results
   */
  async refreshAggregatedData() {
    logger.info('Refreshing aggregated analytics data');
    
    try {
      // Refresh materialized views
      await db.raw('REFRESH MATERIALIZED VIEW CONCURRENTLY site_performance_comparison_mv');
      await db.raw('REFRESH MATERIALIZED VIEW CONCURRENTLY regional_performance_mv');
      await db.raw('REFRESH MATERIALIZED VIEW CONCURRENTLY site_lifetime_stats');
      
      // Update aggregated tables
      await db.raw(`
        INSERT INTO energy_production_aggregated (site_id, interval, timestamp, interval_label, production_kwh, efficiency_pct)
        SELECT 
          site_id,
          'daily' as interval,
          time_bucket('1 day', timestamp) as timestamp,
          to_char(time_bucket('1 day', timestamp), 'YYYY-MM-DD') as interval_label,
          SUM(production_kwh) as production_kwh,
          AVG(efficiency_pct) as efficiency_pct
        FROM energy_production
        WHERE timestamp >= NOW() - INTERVAL '7 days'
        GROUP BY site_id, time_bucket('1 day', timestamp)
        ON CONFLICT (site_id, interval, timestamp)
        DO UPDATE SET
          production_kwh = EXCLUDED.production_kwh,
          efficiency_pct = EXCLUDED.efficiency_pct,
          updated_at = NOW()
      `);
      
      await db.raw(`
        INSERT INTO energy_production_aggregated (site_id, interval, timestamp, interval_label, production_kwh, efficiency_pct)
        SELECT 
          site_id,
          'monthly' as interval,
          time_bucket('1 month', timestamp) as timestamp,
          to_char(time_bucket('1 month', timestamp), 'YYYY-MM') as interval_label,
          SUM(production_kwh) as production_kwh,
          AVG(efficiency_pct) as efficiency_pct
        FROM energy_production
        WHERE timestamp >= NOW() - INTERVAL '1 year'
        GROUP BY site_id, time_bucket('1 month', timestamp)
        ON CONFLICT (site_id, interval, timestamp)
        DO UPDATE SET
          production_kwh = EXCLUDED.production_kwh,
          efficiency_pct = EXCLUDED.efficiency_pct,
          updated_at = NOW()
      `);
      
      // Similar updates for consumption, savings, and environmental impact
      
      logger.info('Aggregated analytics data refreshed successfully');
      return { success: true, message: 'Aggregated data refreshed successfully' };
    } catch (error) {
      logger.error(`Error refreshing aggregated data: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new AnalyticsService();