const nodemailer = require('nodemailer');
const { createLogger } = require('../utils/logger');
const config = require('../config/config');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');

const logger = createLogger('email-service');

/**
 * Email service for sending various types of emails
 */
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });
    
    // Register Handlebars helpers
    handlebars.registerHelper('formatDate', function(date) {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    });
    
    handlebars.registerHelper('formatCurrency', function(amount, currency = 'ZAR') {
      if (amount === undefined || amount === null) return '';
      
      const formatter = new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: currency
      });
      
      return formatter.format(amount);
    });
  }
  
  /**
   * Load and compile an email template
   * @param {string} templateName - Template name
   * @returns {Function} Compiled template function
   */
  async loadTemplate(templateName) {
    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.hbs`);
      const templateSource = await fs.promises.readFile(templatePath, 'utf8');
      return handlebars.compile(templateSource);
    } catch (error) {
      logger.error(`Failed to load email template ${templateName}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send an email
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    try {
      const result = await this.transporter.sendMail({
        from: options.from || `"Nexus Solar Platform" <${config.email.defaultFrom}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments
      });
      
      logger.info(`Email sent to ${options.to}: ${options.subject}`);
      return result;
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send welcome email to new user
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {string} tenantName - Tenant name
   * @param {string} verificationLink - Email verification link
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeEmail(email, firstName, tenantName, verificationLink) {
    try {
      const template = await this.loadTemplate('welcome');
      
      const html = template({
        firstName,
        tenantName,
        verificationLink,
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: `Welcome to ${tenantName} on Nexus Solar Platform`,
        html
      });
    } catch (error) {
      logger.error(`Failed to send welcome email to ${email}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send password reset email
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {string} resetLink - Password reset link
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordResetEmail(email, firstName, resetLink) {
    try {
      const template = await this.loadTemplate('password-reset');
      
      const html = template({
        firstName,
        resetLink,
        expiryHours: 24,
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: 'Reset Your Nexus Solar Platform Password',
        html
      });
    } catch (error) {
      logger.error(`Failed to send password reset email to ${email}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send bill reconciliation report
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {Object} reconciliationData - Bill reconciliation data
   * @param {Buffer} pdfReport - PDF report buffer
   * @returns {Promise<Object>} Send result
   */
  async sendBillReconciliationReport(email, firstName, reconciliationData, pdfReport) {
    try {
      const template = await this.loadTemplate('bill-reconciliation');
      
      const html = template({
        firstName,
        billPeriod: reconciliationData.billPeriod,
        utilityBill: reconciliationData.utilityBill,
        solarCredit: reconciliationData.solarCredit,
        netAmount: reconciliationData.netAmount,
        variance: reconciliationData.variance,
        variancePercentage: reconciliationData.variancePercentage,
        currency: reconciliationData.currency || 'ZAR',
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: `Your Solar Bill Reconciliation Report - ${reconciliationData.billPeriod}`,
        html,
        attachments: [
          {
            filename: `Reconciliation_Report_${reconciliationData.billPeriod.replace(/\s/g, '_')}.pdf`,
            content: pdfReport,
            contentType: 'application/pdf'
          }
        ]
      });
    } catch (error) {
      logger.error(`Failed to send bill reconciliation report to ${email}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send system alert notification
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {Object} alertData - Alert data
   * @returns {Promise<Object>} Send result
   */
  async sendAlertNotification(email, firstName, alertData) {
    try {
      const template = await this.loadTemplate('system-alert');
      
      const html = template({
        firstName,
        siteName: alertData.siteName,
        alertType: alertData.alertType,
        alertSeverity: alertData.alertSeverity,
        alertMessage: alertData.alertMessage,
        alertTime: alertData.alertTime,
        dashboardLink: alertData.dashboardLink,
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: `${alertData.alertSeverity.toUpperCase()} Alert: ${alertData.siteName} - ${alertData.alertType}`,
        html
      });
    } catch (error) {
      logger.error(`Failed to send alert notification to ${email}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send tenant transfer notification
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {string} sourceTenantName - Source tenant name
   * @param {string} destTenantName - Destination tenant name
   * @param {string} role - User role in new tenant
   * @returns {Promise<Object>} Send result
   */
  async sendTenantTransferEmail(email, firstName, sourceTenantName, destTenantName, role) {
    try {
      const template = await this.loadTemplate('tenant-transfer');
      
      const html = template({
        firstName,
        sourceTenantName,
        destTenantName,
        role,
        transferDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        loginLink: `${config.frontendUrl}/login`,
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: `Your Account Has Been Transferred to ${destTenantName}`,
        html
      });
    } catch (error) {
      logger.error(`Failed to send tenant transfer email to ${email}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send blockchain transaction confirmation
   * @param {string} email - User email
   * @param {string} firstName - User first name
   * @param {Object} transactionData - Transaction data
   * @returns {Promise<Object>} Send result
   */
  async sendTransactionConfirmation(email, firstName, transactionData) {
    try {
      const template = await this.loadTemplate('transaction-confirmation');
      
      const html = template({
        firstName,
        transactionType: transactionData.type,
        transactionId: transactionData.id,
        transactionHash: transactionData.hash,
        amount: transactionData.amount,
        currency: transactionData.currency,
        timestamp: new Date(transactionData.timestamp).toLocaleString(),
        blockExplorerLink: transactionData.blockExplorerLink,
        year: new Date().getFullYear()
      });
      
      return await this.sendEmail({
        to: email,
        subject: `Blockchain Transaction ${transactionData.type} Confirmation`,
        html
      });
    } catch (error) {
      logger.error(`Failed to send transaction confirmation to ${email}: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new EmailService();