const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');
const emailService = require('./email.service');

const logger = createLogger('tenant-service');

/**
 * Service for tenant management operations
 */
class TenantService {
  /**
   * Create a new tenant
   * @param {Object} tenantData - Tenant data
   * @param {string} createdBy - User ID of creator
   * @returns {Promise<Object>} Created tenant
   */
  async createTenant(tenantData, createdBy) {
    logger.info(`Creating new tenant: ${tenantData.name}`);
    
    const { name, description, domain, settings, branding } = tenantData;
    
    // Check if tenant with same name or domain already exists
    const existingTenant = await db('tenants')
      .where('name', name)
      .orWhere('domain', domain)
      .first();
    
    if (existingTenant) {
      throw new BadRequestError('Tenant with this name or domain already exists');
    }
    
    // Create tenant
    const [tenant] = await db('tenants')
      .insert({
        name,
        description,
        domain,
        settings: settings ? JSON.stringify(settings) : null,
        branding: branding ? JSON.stringify(branding) : null,
        created_by: createdBy,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`Tenant created with ID: ${tenant.id}`);
    return tenant;
  }
  
  /**
   * Get tenant by ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Tenant
   */
  async getTenantById(tenantId) {
    const tenant = await db('tenants')
      .where('id', tenantId)
      .first();
    
    if (!tenant) {
      throw new NotFoundError('Tenant not found');
    }
    
    return tenant;
  }
  
  /**
   * Update tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated tenant
   */
  async updateTenant(tenantId, updateData) {
    logger.info(`Updating tenant: ${tenantId}`);
    
    const tenant = await this.getTenantById(tenantId);
    
    const { name, description, domain, settings, branding, status } = updateData;
    
    // Check if new name or domain conflicts with existing tenant
    if (name || domain) {
      const existingTenant = await db('tenants')
        .where(function() {
          if (name) this.where('name', name);
          if (domain) this.orWhere('domain', domain);
        })
        .whereNot('id', tenantId)
        .first();
      
      if (existingTenant) {
        throw new BadRequestError('Another tenant with this name or domain already exists');
      }
    }
    
    // Update tenant
    const [updatedTenant] = await db('tenants')
      .where('id', tenantId)
      .update({
        ...(name && { name }),
        ...(description && { description }),
        ...(domain && { domain }),
        ...(settings && { settings: JSON.stringify(settings) }),
        ...(branding && { branding: JSON.stringify(branding) }),
        ...(status && { status }),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`Tenant updated: ${tenantId}`);
    return updatedTenant;
  }
  
  /**
   * Delete tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success
   */
  async deleteTenant(tenantId) {
    logger.info(`Deleting tenant: ${tenantId}`);
    
    const tenant = await this.getTenantById(tenantId);
    
    // Check if tenant has users
    const userCount = await db('users')
      .where('tenant_id', tenantId)
      .count('id as count')
      .first();
    
    if (userCount.count > 0) {
      throw new BadRequestError('Cannot delete tenant with active users');
    }
    
    // Delete tenant
    await db('tenants')
      .where('id', tenantId)
      .delete();
    
    logger.info(`Tenant deleted: ${tenantId}`);
    return true;
  }
  
  /**
   * Get all tenants
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Tenants and pagination info
   */
  async getAllTenants(filters = {}, page = 1, limit = 20) {
    const query = db('tenants')
      .select('*')
      .orderBy('created_at', 'desc');
    
    // Apply filters
    if (filters.name) {
      query.where('name', 'ilike', `%${filters.name}%`);
    }
    
    if (filters.status) {
      query.where('status', filters.status);
    }
    
    // Get total count
    const [{ count }] = await db('tenants')
      .count('id as count')
      .modify(builder => {
        if (filters.name) {
          builder.where('name', 'ilike', `%${filters.name}%`);
        }
        if (filters.status) {
          builder.where('status', filters.status);
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const tenants = await query;
    
    return {
      tenants,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
  
  /**
   * Add user to tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} role - User role in tenant
   * @returns {Promise<Object>} User tenant association
   */
  async addUserToTenant(tenantId, userId, role) {
    logger.info(`Adding user ${userId} to tenant ${tenantId} with role ${role}`);
    
    // Check if tenant exists
    const tenant = await this.getTenantById(tenantId);
    
    // Check if user exists
    const user = await db('users')
      .where('id', userId)
      .first();
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Check if user is already in tenant
    const existingAssociation = await db('tenant_users')
      .where({
        tenant_id: tenantId,
        user_id: userId
      })
      .first();
    
    if (existingAssociation) {
      throw new BadRequestError('User is already associated with this tenant');
    }
    
    // Add user to tenant
    const [association] = await db('tenant_users')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`User ${userId} added to tenant ${tenantId}`);
    return association;
  }
  
  /**
   * Remove user from tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success
   */
  async removeUserFromTenant(tenantId, userId) {
    logger.info(`Removing user ${userId} from tenant ${tenantId}`);
    
    // Check if tenant exists
    const tenant = await this.getTenantById(tenantId);
    
    // Check if user is in tenant
    const association = await db('tenant_users')
      .where({
        tenant_id: tenantId,
        user_id: userId
      })
      .first();
    
    if (!association) {
      throw new NotFoundError('User is not associated with this tenant');
    }
    
    // Remove user from tenant
    await db('tenant_users')
      .where({
        tenant_id: tenantId,
        user_id: userId
      })
      .delete();
    
    logger.info(`User ${userId} removed from tenant ${tenantId}`);
    return true;
  }
  
  /**
   * Update user role in tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} userId - User ID
   * @param {string} role - New role
   * @returns {Promise<Object>} Updated association
   */
  async updateUserRole(tenantId, userId, role) {
    logger.info(`Updating role for user ${userId} in tenant ${tenantId} to ${role}`);
    
    // Check if tenant exists
    const tenant = await this.getTenantById(tenantId);
    
    // Check if user is in tenant
    const association = await db('tenant_users')
      .where({
        tenant_id: tenantId,
        user_id: userId
      })
      .first();
    
    if (!association) {
      throw new NotFoundError('User is not associated with this tenant');
    }
    
    // Update role
    const [updatedAssociation] = await db('tenant_users')
      .where({
        tenant_id: tenantId,
        user_id: userId
      })
      .update({
        role,
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`Role updated for user ${userId} in tenant ${tenantId}`);
    return updatedAssociation;
  }
  
  /**
   * Transfer user to another tenant
   * @param {string} userId - User ID
   * @param {string} fromTenantId - Source tenant ID
   * @param {string} toTenantId - Destination tenant ID
   * @param {string} role - Role in new tenant
   * @returns {Promise<Object>} New association
   */
  async transferUserToTenant(userId, fromTenantId, toTenantId, role) {
    logger.info(`Transferring user ${userId} from tenant ${fromTenantId} to tenant ${toTenantId}`);
    
    // Check if source tenant exists
    const sourceTenant = await this.getTenantById(fromTenantId);
    
    // Check if destination tenant exists
    const destTenant = await this.getTenantById(toTenantId);
    
    // Check if user exists
    const user = await db('users')
      .where('id', userId)
      .first();
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    // Check if user is in source tenant
    const sourceAssociation = await db('tenant_users')
      .where({
        tenant_id: fromTenantId,
        user_id: userId
      })
      .first();
    
    if (!sourceAssociation) {
      throw new NotFoundError('User is not associated with the source tenant');
    }
    
    // Check if user is already in destination tenant
    const destAssociation = await db('tenant_users')
      .where({
        tenant_id: toTenantId,
        user_id: userId
      })
      .first();
    
    if (destAssociation) {
      throw new BadRequestError('User is already associated with the destination tenant');
    }
    
    // Start a transaction
    await db.transaction(async trx => {
      // Remove from source tenant
      await trx('tenant_users')
        .where({
          tenant_id: fromTenantId,
          user_id: userId
        })
        .delete();
      
      // Add to destination tenant
      await trx('tenant_users')
        .insert({
          tenant_id: toTenantId,
          user_id: userId,
          role,
          created_at: new Date(),
          updated_at: new Date()
        });
      
      // Update user's primary tenant if needed
      if (user.primary_tenant_id === fromTenantId) {
        await trx('users')
          .where('id', userId)
          .update({
            primary_tenant_id: toTenantId,
            updated_at: new Date()
          });
      }
    });
    
    // Send notification email to user
    try {
      await emailService.sendTenantTransferEmail(
        user.email,
        user.first_name,
        sourceTenant.name,
        destTenant.name,
        role
      );
      logger.info(`Tenant transfer notification email sent to ${user.email}`);
    } catch (error) {
      logger.error(`Failed to send tenant transfer notification email: ${error.message}`);
      // Don't fail the operation if email sending fails
    }
    
    logger.info(`User ${userId} transferred from tenant ${fromTenantId} to tenant ${toTenantId}`);
    
    // Return new association
    const newAssociation = await db('tenant_users')
      .where({
        tenant_id: toTenantId,
        user_id: userId
      })
      .first();
    
    return newAssociation;
  }
  
  /**
   * Get users in tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Users and pagination info
   */
  async getTenantUsers(tenantId, filters = {}, page = 1, limit = 20) {
    // Check if tenant exists
    const tenant = await this.getTenantById(tenantId);
    
    const query = db('users as u')
      .join('tenant_users as tu', 'u.id', 'tu.user_id')
      .where('tu.tenant_id', tenantId)
      .select(
        'u.id',
        'u.email',
        'u.first_name',
        'u.last_name',
        'u.status',
        'u.created_at',
        'tu.role'
      )
      .orderBy('u.created_at', 'desc');
    
    // Apply filters
    if (filters.name) {
      query.where(function() {
        this.where('u.first_name', 'ilike', `%${filters.name}%`)
          .orWhere('u.last_name', 'ilike', `%${filters.name}%`);
      });
    }
    
    if (filters.email) {
      query.where('u.email', 'ilike', `%${filters.email}%`);
    }
    
    if (filters.role) {
      query.where('tu.role', filters.role);
    }
    
    if (filters.status) {
      query.where('u.status', filters.status);
    }
    
    // Get total count
    const [{ count }] = await db('users as u')
      .join('tenant_users as tu', 'u.id', 'tu.user_id')
      .where('tu.tenant_id', tenantId)
      .count('u.id as count')
      .modify(builder => {
        if (filters.name) {
          builder.where(function() {
            this.where('u.first_name', 'ilike', `%${filters.name}%`)
              .orWhere('u.last_name', 'ilike', `%${filters.name}%`);
          });
        }
        if (filters.email) {
          builder.where('u.email', 'ilike', `%${filters.email}%`);
        }
        if (filters.role) {
          builder.where('tu.role', filters.role);
        }
        if (filters.status) {
          builder.where('u.status', filters.status);
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const users = await query;
    
    return {
      users,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
}

module.exports = new TenantService();