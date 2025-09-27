const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const userService = require('./user.service');

const logger = createLogger('challenge-service');

/**
 * Service for family engagement challenges
 */
class ChallengeService {
  /**
   * Create a new challenge
   * @param {Object} challengeData - Challenge data
   * @param {string} createdBy - User ID of creator
   * @returns {Promise<Object>} Created challenge
   */
  async createChallenge(challengeData, createdBy) {
    logger.info(`Creating new challenge: ${challengeData.title}`);
    
    const {
      title,
      description,
      category,
      points,
      start_date,
      end_date,
      requirements,
      tenant_id
    } = challengeData;
    
    // Create challenge
    const [challenge] = await db('challenges')
      .insert({
        title,
        description,
        category,
        points,
        start_date: new Date(start_date),
        end_date: end_date ? new Date(end_date) : null,
        requirements: requirements ? JSON.stringify(requirements) : null,
        tenant_id,
        created_by: createdBy,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`Challenge created with ID: ${challenge.id}`);
    return challenge;
  }
  
  /**
   * Get challenge by ID
   * @param {string} challengeId - Challenge ID
   * @returns {Promise<Object>} Challenge
   */
  async getChallengeById(challengeId) {
    const challenge = await db('challenges')
      .where('id', challengeId)
      .first();
    
    if (!challenge) {
      throw new NotFoundError('Challenge not found');
    }
    
    return challenge;
  }
  
  /**
   * Update challenge
   * @param {string} challengeId - Challenge ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated challenge
   */
  async updateChallenge(challengeId, updateData) {
    logger.info(`Updating challenge: ${challengeId}`);
    
    const challenge = await this.getChallengeById(challengeId);
    
    const {
      title,
      description,
      category,
      points,
      start_date,
      end_date,
      requirements,
      status
    } = updateData;
    
    // Update challenge
    const [updatedChallenge] = await db('challenges')
      .where('id', challengeId)
      .update({
        ...(title && { title }),
        ...(description && { description }),
        ...(category && { category }),
        ...(points && { points }),
        ...(start_date && { start_date: new Date(start_date) }),
        ...(end_date && { end_date: end_date ? new Date(end_date) : null }),
        ...(requirements && { requirements: JSON.stringify(requirements) }),
        ...(status && { status }),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`Challenge updated: ${challengeId}`);
    return updatedChallenge;
  }
  
  /**
   * Delete challenge
   * @param {string} challengeId - Challenge ID
   * @returns {Promise<boolean>} Success
   */
  async deleteChallenge(challengeId) {
    logger.info(`Deleting challenge: ${challengeId}`);
    
    const challenge = await this.getChallengeById(challengeId);
    
    // Check if challenge has participants
    const participantCount = await db('challenge_participants')
      .where('challenge_id', challengeId)
      .count('id as count')
      .first();
    
    if (participantCount.count > 0) {
      throw new BadRequestError('Cannot delete challenge with active participants');
    }
    
    // Delete challenge
    await db('challenges')
      .where('id', challengeId)
      .delete();
    
    logger.info(`Challenge deleted: ${challengeId}`);
    return true;
  }
  
  /**
   * Get all challenges
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Challenges and pagination info
   */
  async getAllChallenges(filters = {}, page = 1, limit = 20) {
    const query = db('challenges')
      .select('*')
      .orderBy('created_at', 'desc');
    
    // Apply filters
    if (filters.title) {
      query.where('title', 'ilike', `%${filters.title}%`);
    }
    
    if (filters.category) {
      query.where('category', filters.category);
    }
    
    if (filters.status) {
      query.where('status', filters.status);
    }
    
    if (filters.tenant_id) {
      query.where('tenant_id', filters.tenant_id);
    }
    
    // Get total count
    const [{ count }] = await db('challenges')
      .count('id as count')
      .modify(builder => {
        if (filters.title) {
          builder.where('title', 'ilike', `%${filters.title}%`);
        }
        if (filters.category) {
          builder.where('category', filters.category);
        }
        if (filters.status) {
          builder.where('status', filters.status);
        }
        if (filters.tenant_id) {
          builder.where('tenant_id', filters.tenant_id);
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const challenges = await query;
    
    return {
      challenges,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
  
  /**
   * Join a challenge
   * @param {string} challengeId - Challenge ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Challenge participation
   */
  async joinChallenge(challengeId, userId) {
    logger.info(`User ${userId} joining challenge ${challengeId}`);
    
    // Check if challenge exists
    const challenge = await this.getChallengeById(challengeId);
    
    // Check if challenge is active
    if (challenge.status !== 'active') {
      throw new BadRequestError('Challenge is not active');
    }
    
    // Check if user is already participating
    const existingParticipation = await db('challenge_participants')
      .where({
        challenge_id: challengeId,
        user_id: userId
      })
      .first();
    
    if (existingParticipation) {
      throw new BadRequestError('User is already participating in this challenge');
    }
    
    // Add user to challenge
    const [participation] = await db('challenge_participants')
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        status: 'in_progress',
        progress: 0,
        joined_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');
    
    logger.info(`User ${userId} joined challenge ${challengeId}`);
    return participation;
  }
  
  /**
   * Update challenge progress
   * @param {string} challengeId - Challenge ID
   * @param {string} userId - User ID
   * @param {number} progress - Progress percentage (0-100)
   * @returns {Promise<Object>} Updated participation
   */
  async updateProgress(challengeId, userId, progress) {
    logger.info(`Updating progress for user ${userId} in challenge ${challengeId}: ${progress}%`);
    
    // Check if user is participating
    const participation = await db('challenge_participants')
      .where({
        challenge_id: challengeId,
        user_id: userId
      })
      .first();
    
    if (!participation) {
      throw new NotFoundError('User is not participating in this challenge');
    }
    
    // Validate progress
    if (progress < 0 || progress > 100) {
      throw new BadRequestError('Progress must be between 0 and 100');
    }
    
    // Update progress
    const [updatedParticipation] = await db('challenge_participants')
      .where({
        challenge_id: challengeId,
        user_id: userId
      })
      .update({
        progress,
        updated_at: new Date(),
        ...(progress === 100 && participation.status !== 'completed' ? {
          status: 'completed',
          completed_at: new Date()
        } : {})
      })
      .returning('*');
    
    // If challenge is completed, award points
    if (progress === 100 && participation.status !== 'completed') {
      // Get challenge details for points
      const challenge = await this.getChallengeById(challengeId);
      
      // Award points using transaction to ensure atomicity
      try {
        await db.transaction(async trx => {
          // Award points to user
          await trx('user_points')
            .insert({
              user_id: userId,
              points: challenge.points,
              source: 'challenge',
              source_id: challengeId,
              description: `Completed challenge: ${challenge.title}`,
              created_at: new Date()
            });
          
          // Update user's total points
          await trx('users')
            .where('id', userId)
            .increment('total_points', challenge.points);
          
          logger.info(`Awarded ${challenge.points} points to user ${userId} for completing challenge ${challengeId}`);
        });
      } catch (error) {
        logger.error(`Error awarding points to user ${userId} for challenge ${challengeId}: ${error.message}`);
        
        // Retry point awarding in case of failure
        await this._retryPointAwarding(challengeId, userId, challenge.points);
      }
    }
    
    logger.info(`Progress updated for user ${userId} in challenge ${challengeId}`);
    return updatedParticipation;
  }
  
  /**
   * Retry point awarding in case of failure
   * @param {string} challengeId - Challenge ID
   * @param {string} userId - User ID
   * @param {number} points - Points to award
   * @returns {Promise<boolean>} Success
   * @private
   */
  async _retryPointAwarding(challengeId, userId, points) {
    logger.info(`Retrying point awarding for user ${userId}, challenge ${challengeId}`);
    
    try {
      // Check if points were already awarded (to prevent duplicates)
      const existingPoints = await db('user_points')
        .where({
          user_id: userId,
          source: 'challenge',
          source_id: challengeId
        })
        .first();
      
      if (existingPoints) {
        logger.info(`Points were already awarded to user ${userId} for challenge ${challengeId}`);
        return true;
      }
      
      // Get challenge details
      const challenge = await this.getChallengeById(challengeId);
      
      // Award points in a transaction
      await db.transaction(async trx => {
        // Award points to user
        await trx('user_points')
          .insert({
            user_id: userId,
            points: points,
            source: 'challenge',
            source_id: challengeId,
            description: `Completed challenge: ${challenge.title}`,
            created_at: new Date()
          });
        
        // Update user's total points
        await trx('users')
          .where('id', userId)
          .increment('total_points', points);
      });
      
      logger.info(`Successfully retried awarding ${points} points to user ${userId} for challenge ${challengeId}`);
      return true;
    } catch (error) {
      logger.error(`Error in retry awarding points: ${error.message}`);
      
      // Schedule another retry through a background job
      // This would typically be done through a job queue like Bull
      setTimeout(async () => {
        try {
          await this._retryPointAwarding(challengeId, userId, points);
        } catch (retryError) {
          logger.error(`Final retry failed for awarding points to user ${userId} for challenge ${challengeId}: ${retryError.message}`);
        }
      }, 60000); // Retry after 1 minute
      
      return false;
    }
  }
  
  /**
   * Get user challenge participations
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Participations and pagination info
   */
  async getUserChallenges(userId, filters = {}, page = 1, limit = 20) {
    const query = db('challenge_participants as cp')
      .join('challenges as c', 'cp.challenge_id', 'c.id')
      .where('cp.user_id', userId)
      .select(
        'cp.*',
        'c.title',
        'c.description',
        'c.category',
        'c.points',
        'c.start_date',
        'c.end_date',
        'c.requirements'
      )
      .orderBy('cp.joined_at', 'desc');
    
    // Apply filters
    if (filters.status) {
      query.where('cp.status', filters.status);
    }
    
    if (filters.category) {
      query.where('c.category', filters.category);
    }
    
    // Get total count
    const [{ count }] = await db('challenge_participants as cp')
      .join('challenges as c', 'cp.challenge_id', 'c.id')
      .where('cp.user_id', userId)
      .count('cp.id as count')
      .modify(builder => {
        if (filters.status) {
          builder.where('cp.status', filters.status);
        }
        if (filters.category) {
          builder.where('c.category', filters.category);
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const participations = await query;
    
    return {
      participations,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
  
  /**
   * Get challenge leaderboard
   * @param {string} challengeId - Challenge ID
   * @param {number} limit - Number of top users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getChallengeLeaderboard(challengeId, limit = 10) {
    // Check if challenge exists
    const challenge = await this.getChallengeById(challengeId);
    
    // Get leaderboard
    const leaderboard = await db('challenge_participants as cp')
      .join('users as u', 'cp.user_id', 'u.id')
      .where('cp.challenge_id', challengeId)
      .select(
        'u.id',
        'u.first_name',
        'u.last_name',
        'u.avatar_url',
        'cp.progress',
        'cp.status',
        'cp.completed_at'
      )
      .orderBy([
        { column: 'cp.status', order: 'desc' }, // Completed first
        { column: 'cp.progress', order: 'desc' }, // Higher progress next
        { column: 'cp.completed_at', order: 'asc' } // Earlier completion time for ties
      ])
      .limit(limit);
    
    return leaderboard;
  }
  
  /**
   * Get global leaderboard across all challenges
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Number of top users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getGlobalLeaderboard(tenantId, limit = 10) {
    // Get leaderboard
    const leaderboard = await db('users as u')
      .leftJoin('challenge_participants as cp', 'u.id', 'cp.user_id')
      .leftJoin('challenges as c', 'cp.challenge_id', 'c.id')
      .where('u.tenant_id', tenantId)
      .groupBy('u.id')
      .select(
        'u.id',
        'u.first_name',
        'u.last_name',
        'u.avatar_url',
        'u.total_points',
        db.raw('COUNT(DISTINCT CASE WHEN cp.status = \'completed\' THEN cp.challenge_id END) as completed_challenges')
      )
      .orderBy('u.total_points', 'desc')
      .limit(limit);
    
    return leaderboard;
  }
  
  /**
   * Verify and fix any missing points for completed challenges
   * @returns {Promise<Object>} Results of verification
   */
  async verifyAndFixChallengePoints() {
    logger.info('Starting verification of challenge points');
    
    const results = {
      verified: 0,
      fixed: 0,
      errors: 0
    };
    
    try {
      // Find completed challenges that might be missing points
      const completedChallenges = await db('challenge_participants as cp')
        .leftJoin('user_points as up', function() {
          this.on('up.user_id', '=', 'cp.user_id')
            .andOn('up.source', '=', db.raw('\'challenge\''))
            .andOn('up.source_id', '=', 'cp.challenge_id');
        })
        .join('challenges as c', 'cp.challenge_id', 'c.id')
        .where('cp.status', 'completed')
        .whereNull('up.id') // No points record exists
        .select(
          'cp.user_id',
          'cp.challenge_id',
          'c.points',
          'c.title'
        );
      
      logger.info(`Found ${completedChallenges.length} completed challenges with potentially missing points`);
      
      // Process each missing points record
      for (const record of completedChallenges) {
        try {
          // Award missing points
          await db.transaction(async trx => {
            // Add points record
            await trx('user_points')
              .insert({
                user_id: record.user_id,
                points: record.points,
                source: 'challenge',
                source_id: record.challenge_id,
                description: `Completed challenge: ${record.title} (retroactively awarded)`,
                created_at: new Date()
              });
            
            // Update user's total points
            await trx('users')
              .where('id', record.user_id)
              .increment('total_points', record.points);
          });
          
          logger.info(`Fixed missing points for user ${record.user_id}, challenge ${record.challenge_id}: awarded ${record.points} points`);
          results.fixed++;
        } catch (error) {
          logger.error(`Error fixing points for user ${record.user_id}, challenge ${record.challenge_id}: ${error.message}`);
          results.errors++;
        }
      }
      
      // Count verified records (those with points correctly awarded)
      const verifiedCount = await db('challenge_participants as cp')
        .join('user_points as up', function() {
          this.on('up.user_id', '=', 'cp.user_id')
            .andOn('up.source', '=', db.raw('\'challenge\''))
            .andOn('up.source_id', '=', 'cp.challenge_id');
        })
        .where('cp.status', 'completed')
        .count('cp.id as count')
        .first();
      
      results.verified = parseInt(verifiedCount.count);
      
      logger.info(`Challenge points verification complete: ${results.verified} verified, ${results.fixed} fixed, ${results.errors} errors`);
      return results;
    } catch (error) {
      logger.error(`Error in challenge points verification: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ChallengeService();