const Queue = require('bull');
const axios = require('axios');
const { createLogger } = require('../utils/logger');
const config = require('../config/config');

const logger = createLogger('email-queue');

// Create email queue with Redis connection
const emailQueue = new Queue('email-queue', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    tls: config.redis.tls ? {} : null
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Configure queue settings
emailQueue.settings = {
  // Increase concurrency for faster processing
  concurrency: 10,
  // Limit rate to avoid overwhelming email service
  limiter: {
    max: 50,
    duration: 10000 // 50 emails per 10 seconds
  }
};

// Process email jobs
emailQueue.process(async (job) => {
  const { type, data } = job;
  logger.info(`Processing ${type} email job ${job.id}`);
  
  try {
    // Call email service API
    const response = await axios.post(
      `${config.services.backendUrl}/api/internal/email/send`,
      {
        type,
        data
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.services.internalApiKey}`
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    if (response.status !== 200) {
      throw new Error(`Email service returned status ${response.status}`);
    }
    
    logger.info(`Email job ${job.id} processed successfully`);
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    logger.error(`Error processing email job ${job.id}: ${error.message}`);
    throw error;
  }
});

// Handle completed jobs
emailQueue.on('completed', (job, result) => {
  logger.debug(`Email job ${job.id} completed with result: ${JSON.stringify(result)}`);
});

// Handle failed jobs
emailQueue.on('failed', (job, error) => {
  logger.error(`Email job ${job.id} failed with error: ${error.message}`);
  
  // If this was the final retry, log it more prominently
  if (job.attemptsMade >= job.opts.attempts) {
    logger.error(`Email job ${job.id} permanently failed after ${job.attemptsMade} attempts`);
    
    // For transaction confirmation emails, this is critical - log additional details
    if (job.name === 'transaction-confirmation') {
      logger.error(`CRITICAL: Transaction confirmation email permanently failed: ${JSON.stringify(job.data)}`);
      
      // TODO: Implement fallback notification mechanism
      // This could be a webhook to an incident management system
      // or a direct notification to operations team
    }
  }
});

// Handle queue errors
emailQueue.on('error', (error) => {
  logger.error(`Email queue error: ${error.message}`);
});

// Add monitoring for stalled jobs
emailQueue.on('stalled', (job) => {
  logger.warn(`Email job ${job.id} stalled`);
});

// Add queue cleanup job to remove old failed jobs
const cleanupQueue = new Queue('email-queue-cleanup', {
  redis: {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    tls: config.redis.tls ? {} : null
  }
});

cleanupQueue.add(
  {},
  {
    repeat: {
      cron: '0 0 * * *' // Run daily at midnight
    }
  }
);

cleanupQueue.process(async () => {
  logger.info('Running email queue cleanup');
  
  try {
    // Get failed jobs older than 7 days
    const jobs = await emailQueue.getFailed();
    const oldJobs = jobs.filter(job => {
      const jobAge = Date.now() - job.timestamp;
      return jobAge > 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    });
    
    // Remove old failed jobs
    for (const job of oldJobs) {
      await job.remove();
    }
    
    logger.info(`Cleaned up ${oldJobs.length} old failed email jobs`);
    return { cleaned: oldJobs.length };
  } catch (error) {
    logger.error(`Error cleaning up email queue: ${error.message}`);
    throw error;
  }
});

module.exports = emailQueue;