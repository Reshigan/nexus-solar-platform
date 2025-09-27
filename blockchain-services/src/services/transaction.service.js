const { ethers } = require('ethers');
const { db } = require('../config/database');
const { createLogger } = require('../utils/logger');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const emailQueue = require('../queues/email.queue');
const config = require('../config/config');

const logger = createLogger('transaction-service');

/**
 * Service for blockchain transaction operations
 */
class TransactionService {
  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(config.blockchain.providerUrl);
    this.wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);
    this.contract = new ethers.Contract(
      config.blockchain.contractAddress,
      config.blockchain.contractAbi,
      this.wallet
    );
  }
  
  /**
   * Create a new energy sell order
   * @param {Object} orderData - Order data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created order
   */
  async createSellOrder(orderData, userId) {
    logger.info(`Creating sell order for user ${userId}`);
    
    const { amount, price, expiryTime } = orderData;
    
    // Validate inputs
    if (!amount || amount <= 0) {
      throw new BadRequestError('Invalid energy amount');
    }
    
    if (!price || price <= 0) {
      throw new BadRequestError('Invalid price');
    }
    
    // Get user wallet
    const userWallet = await db('user_wallets')
      .where('user_id', userId)
      .first();
    
    if (!userWallet) {
      throw new NotFoundError('User wallet not found');
    }
    
    try {
      // Create transaction on blockchain
      const tx = await this.contract.createSellOrder(
        ethers.utils.parseEther(amount.toString()),
        ethers.utils.parseEther(price.toString()),
        expiryTime || Math.floor(Date.now() / 1000) + 86400, // Default 24 hours
        {
          gasLimit: 500000
        }
      );
      
      logger.info(`Transaction submitted: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
      
      // Get order ID from event logs
      const event = receipt.events.find(e => e.event === 'SellOrderCreated');
      const orderId = event.args.orderId.toString();
      
      // Store order in database
      const [order] = await db('energy_orders')
        .insert({
          id: orderId,
          user_id: userId,
          type: 'sell',
          amount,
          price,
          total: amount * price,
          status: 'active',
          expiry_time: new Date(expiryTime * 1000 || Date.now() + 86400000),
          transaction_hash: receipt.transactionHash,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      // Send confirmation email immediately using high-priority queue
      await this._sendTransactionEmail(userId, {
        type: 'Sell Order',
        id: orderId,
        hash: receipt.transactionHash,
        amount,
        price,
        total: amount * price,
        currency: 'ZAR',
        timestamp: new Date().toISOString()
      }, true); // true for high priority
      
      logger.info(`Sell order created with ID: ${orderId}`);
      return order;
    } catch (error) {
      logger.error(`Error creating sell order: ${error.message}`);
      throw new Error(`Failed to create sell order: ${error.message}`);
    }
  }
  
  /**
   * Create a new energy buy order
   * @param {Object} orderData - Order data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created order
   */
  async createBuyOrder(orderData, userId) {
    logger.info(`Creating buy order for user ${userId}`);
    
    const { amount, maxPrice, expiryTime } = orderData;
    
    // Validate inputs
    if (!amount || amount <= 0) {
      throw new BadRequestError('Invalid energy amount');
    }
    
    if (!maxPrice || maxPrice <= 0) {
      throw new BadRequestError('Invalid max price');
    }
    
    // Get user wallet
    const userWallet = await db('user_wallets')
      .where('user_id', userId)
      .first();
    
    if (!userWallet) {
      throw new NotFoundError('User wallet not found');
    }
    
    try {
      // Create transaction on blockchain
      const tx = await this.contract.createBuyOrder(
        ethers.utils.parseEther(amount.toString()),
        ethers.utils.parseEther(maxPrice.toString()),
        expiryTime || Math.floor(Date.now() / 1000) + 86400, // Default 24 hours
        {
          value: ethers.utils.parseEther((amount * maxPrice).toString()),
          gasLimit: 500000
        }
      );
      
      logger.info(`Transaction submitted: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      logger.info(`Transaction confirmed: ${receipt.transactionHash}`);
      
      // Get order ID from event logs
      const event = receipt.events.find(e => e.event === 'BuyOrderCreated');
      const orderId = event.args.orderId.toString();
      
      // Store order in database
      const [order] = await db('energy_orders')
        .insert({
          id: orderId,
          user_id: userId,
          type: 'buy',
          amount,
          price: maxPrice,
          total: amount * maxPrice,
          status: 'active',
          expiry_time: new Date(expiryTime * 1000 || Date.now() + 86400000),
          transaction_hash: receipt.transactionHash,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');
      
      // Send confirmation email immediately using high-priority queue
      await this._sendTransactionEmail(userId, {
        type: 'Buy Order',
        id: orderId,
        hash: receipt.transactionHash,
        amount,
        price: maxPrice,
        total: amount * maxPrice,
        currency: 'ZAR',
        timestamp: new Date().toISOString()
      }, true); // true for high priority
      
      logger.info(`Buy order created with ID: ${orderId}`);
      return order;
    } catch (error) {
      logger.error(`Error creating buy order: ${error.message}`);
      throw new Error(`Failed to create buy order: ${error.message}`);
    }
  }
  
  /**
   * Match buy and sell orders
   * @param {string} buyOrderId - Buy order ID
   * @param {string} sellOrderId - Sell order ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Match result
   */
  async matchOrders(buyOrderId, sellOrderId, userId) {
    logger.info(`Matching orders: Buy ${buyOrderId}, Sell ${sellOrderId}`);
    
    // Get orders from database
    const buyOrder = await db('energy_orders')
      .where('id', buyOrderId)
      .first();
    
    const sellOrder = await db('energy_orders')
      .where('id', sellOrderId)
      .first();
    
    if (!buyOrder) {
      throw new NotFoundError('Buy order not found');
    }
    
    if (!sellOrder) {
      throw new NotFoundError('Sell order not found');
    }
    
    // Verify order status
    if (buyOrder.status !== 'active') {
      throw new BadRequestError('Buy order is not active');
    }
    
    if (sellOrder.status !== 'active') {
      throw new BadRequestError('Sell order is not active');
    }
    
    try {
      // Execute match on blockchain
      const tx = await this.contract.matchOrders(
        buyOrderId,
        sellOrderId,
        {
          gasLimit: 700000
        }
      );
      
      logger.info(`Match transaction submitted: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      logger.info(`Match transaction confirmed: ${receipt.transactionHash}`);
      
      // Get match ID from event logs
      const event = receipt.events.find(e => e.event === 'OrdersMatched');
      const matchId = event.args.matchId.toString();
      
      // Update order status in database
      await db('energy_orders')
        .whereIn('id', [buyOrderId, sellOrderId])
        .update({
          status: 'matched',
          updated_at: new Date()
        });
      
      // Store match in database
      const [match] = await db('order_matches')
        .insert({
          id: matchId,
          buy_order_id: buyOrderId,
          sell_order_id: sellOrderId,
          amount: Math.min(buyOrder.amount, sellOrder.amount),
          price: sellOrder.price,
          total: Math.min(buyOrder.amount, sellOrder.amount) * sellOrder.price,
          transaction_hash: receipt.transactionHash,
          matched_by: userId,
          created_at: new Date()
        })
        .returning('*');
      
      // Send confirmation emails to both parties
      const buyerUser = await db('users')
        .where('id', buyOrder.user_id)
        .first();
      
      const sellerUser = await db('users')
        .where('id', sellOrder.user_id)
        .first();
      
      // Send to buyer
      if (buyerUser) {
        await this._sendTransactionEmail(buyOrder.user_id, {
          type: 'Order Match (Buy)',
          id: matchId,
          hash: receipt.transactionHash,
          amount: match.amount,
          price: match.price,
          total: match.total,
          currency: 'ZAR',
          timestamp: new Date().toISOString()
        }, true); // true for high priority
      }
      
      // Send to seller
      if (sellerUser) {
        await this._sendTransactionEmail(sellOrder.user_id, {
          type: 'Order Match (Sell)',
          id: matchId,
          hash: receipt.transactionHash,
          amount: match.amount,
          price: match.price,
          total: match.total,
          currency: 'ZAR',
          timestamp: new Date().toISOString()
        }, true); // true for high priority
      }
      
      logger.info(`Orders matched with ID: ${matchId}`);
      return match;
    } catch (error) {
      logger.error(`Error matching orders: ${error.message}`);
      throw new Error(`Failed to match orders: ${error.message}`);
    }
  }
  
  /**
   * Cancel an order
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cancelled order
   */
  async cancelOrder(orderId, userId) {
    logger.info(`Cancelling order ${orderId} for user ${userId}`);
    
    // Get order from database
    const order = await db('energy_orders')
      .where('id', orderId)
      .first();
    
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    
    // Verify ownership
    if (order.user_id !== userId) {
      throw new BadRequestError('You can only cancel your own orders');
    }
    
    // Verify order status
    if (order.status !== 'active') {
      throw new BadRequestError('Only active orders can be cancelled');
    }
    
    try {
      // Cancel order on blockchain
      const tx = await this.contract.cancelOrder(
        orderId,
        {
          gasLimit: 300000
        }
      );
      
      logger.info(`Cancel transaction submitted: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      logger.info(`Cancel transaction confirmed: ${receipt.transactionHash}`);
      
      // Update order status in database
      const [updatedOrder] = await db('energy_orders')
        .where('id', orderId)
        .update({
          status: 'cancelled',
          updated_at: new Date(),
          cancel_transaction_hash: receipt.transactionHash
        })
        .returning('*');
      
      // Send confirmation email
      await this._sendTransactionEmail(userId, {
        type: 'Order Cancellation',
        id: orderId,
        hash: receipt.transactionHash,
        amount: order.amount,
        price: order.price,
        total: order.total,
        currency: 'ZAR',
        timestamp: new Date().toISOString()
      }, true); // true for high priority
      
      logger.info(`Order cancelled: ${orderId}`);
      return updatedOrder;
    } catch (error) {
      logger.error(`Error cancelling order: ${error.message}`);
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }
  
  /**
   * Get user orders
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Orders and pagination info
   */
  async getUserOrders(userId, filters = {}, page = 1, limit = 20) {
    const query = db('energy_orders')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');
    
    // Apply filters
    if (filters.type) {
      query.where('type', filters.type);
    }
    
    if (filters.status) {
      query.where('status', filters.status);
    }
    
    // Get total count
    const [{ count }] = await db('energy_orders')
      .where('user_id', userId)
      .count('id as count')
      .modify(builder => {
        if (filters.type) {
          builder.where('type', filters.type);
        }
        if (filters.status) {
          builder.where('status', filters.status);
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const orders = await query;
    
    return {
      orders,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
  
  /**
   * Get order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order
   */
  async getOrderById(orderId) {
    const order = await db('energy_orders')
      .where('id', orderId)
      .first();
    
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    
    return order;
  }
  
  /**
   * Get order matches
   * @param {Object} filters - Optional filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Matches and pagination info
   */
  async getOrderMatches(filters = {}, page = 1, limit = 20) {
    const query = db('order_matches as om')
      .join('energy_orders as bo', 'om.buy_order_id', 'bo.id')
      .join('energy_orders as so', 'om.sell_order_id', 'so.id')
      .join('users as bu', 'bo.user_id', 'bu.id')
      .join('users as su', 'so.user_id', 'su.id')
      .select(
        'om.*',
        'bo.user_id as buyer_id',
        'so.user_id as seller_id',
        db.raw('CONCAT(bu.first_name, \' \', bu.last_name) as buyer_name'),
        db.raw('CONCAT(su.first_name, \' \', su.last_name) as seller_name')
      )
      .orderBy('om.created_at', 'desc');
    
    // Apply filters
    if (filters.userId) {
      query.where(function() {
        this.where('bo.user_id', filters.userId)
          .orWhere('so.user_id', filters.userId);
      });
    }
    
    // Get total count
    const [{ count }] = await db('order_matches as om')
      .join('energy_orders as bo', 'om.buy_order_id', 'bo.id')
      .join('energy_orders as so', 'om.sell_order_id', 'so.id')
      .count('om.id as count')
      .modify(builder => {
        if (filters.userId) {
          builder.where(function() {
            this.where('bo.user_id', filters.userId)
              .orWhere('so.user_id', filters.userId);
          });
        }
      });
    
    // Apply pagination
    const offset = (page - 1) * limit;
    query.offset(offset).limit(limit);
    
    const matches = await query;
    
    return {
      matches,
      pagination: {
        total: parseInt(count),
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    };
  }
  
  /**
   * Send transaction confirmation email
   * @param {string} userId - User ID
   * @param {Object} transactionData - Transaction data
   * @param {boolean} highPriority - Whether to use high priority queue
   * @returns {Promise<void>}
   * @private
   */
  async _sendTransactionEmail(userId, transactionData, highPriority = false) {
    try {
      // Get user
      const user = await db('users')
        .where('id', userId)
        .first();
      
      if (!user) {
        logger.warn(`User not found for transaction email: ${userId}`);
        return;
      }
      
      // Add block explorer link
      transactionData.blockExplorerLink = `${config.blockchain.explorerUrl}/tx/${transactionData.hash}`;
      
      // Add to email queue with appropriate priority
      await emailQueue.add(
        'transaction-confirmation',
        {
          email: user.email,
          firstName: user.first_name,
          transactionData
        },
        {
          priority: highPriority ? 1 : 10, // Lower number = higher priority
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: true
        }
      );
      
      logger.info(`Transaction confirmation email queued for ${user.email}`);
    } catch (error) {
      logger.error(`Error queueing transaction email: ${error.message}`);
      // Don't throw error to prevent transaction failure
    }
  }
}

module.exports = new TransactionService();