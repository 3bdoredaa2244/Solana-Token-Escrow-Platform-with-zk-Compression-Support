const express = require('express');
const { Op } = require('sequelize');
const { validateEscrowCreation, validateEscrowAction } = require('../middleware/validation');
const escrowService = require('../services/escrowService');
const { Escrow, TransactionLog } = require('../database/models');

const router = express.Router();

// Create a new escrow
router.post('/create', validateEscrowCreation, async (req, res, next) => {
  try {
    const {
      buyer,
      seller,
      moderator,
      tokenMint,
      amount,
      itemDescription,
      fulfillmentLink,
    } = req.body;

    const result = await escrowService.createEscrow({
      buyer,
      seller,
      moderator,
      tokenMint,
      amount,
      itemDescription,
      fulfillmentLink,
    });

    res.status(201).json({
      success: true,
      data: {
        escrowId: result.escrowId,
        escrowPubkey: result.escrowPubkey,
        transactionSignature: result.transactionSignature,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Deposit tokens into escrow
router.post('/deposit', validateEscrowAction, async (req, res, next) => {
  try {
    const { escrowPubkey, buyerWallet } = req.body;

    const result = await escrowService.depositTokens(escrowPubkey, buyerWallet);

    res.json({
      success: true,
      data: {
        transactionSignature: result.transactionSignature,
        disputeDeadline: result.disputeDeadline,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Release tokens to seller
router.post('/release', validateEscrowAction, async (req, res, next) => {
  try {
    const { escrowPubkey, buyerWallet } = req.body;

    const result = await escrowService.releaseTokens(escrowPubkey, buyerWallet);

    res.json({
      success: true,
      data: {
        transactionSignature: result.transactionSignature,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Raise a dispute
router.post('/dispute', async (req, res, next) => {
  try {
    const { escrowPubkey, buyerWallet, reason } = req.body;

    const result = await escrowService.raiseDispute(escrowPubkey, buyerWallet, reason);

    res.json({
      success: true,
      data: {
        transactionSignature: result.transactionSignature,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Resolve dispute (moderator only)
router.post('/resolve', async (req, res, next) => {
  try {
    const { escrowPubkey, moderatorWallet, resolution } = req.body;

    const result = await escrowService.resolveDispute(escrowPubkey, moderatorWallet, resolution);

    res.json({
      success: true,
      data: {
        transactionSignature: result.transactionSignature,
        resolution,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get escrow details
router.get('/:escrowPubkey', async (req, res, next) => {
  try {
    const { escrowPubkey } = req.params;

    const escrow = await Escrow.findOne({
      where: { escrowPubkey },
      include: [
        {
          model: TransactionLog,
          as: 'transactions',
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Escrow not found',
        },
      });
    }

    // Get on-chain state
    const onChainData = await escrowService.getEscrowData(escrowPubkey);

    res.json({
      success: true,
      data: {
        ...escrow.toJSON(),
        onChain: onChainData,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get escrows by user (buyer or seller)
router.get('/user/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const { role = 'all', state, limit = 20, offset = 0 } = req.query;

    const whereClause = {};
    
    if (role === 'buyer') {
      whereClause.buyer = walletAddress;
    } else if (role === 'seller') {
      whereClause.seller = walletAddress;
    } else {
      whereClause[Op.or] = [
        { buyer: walletAddress },
        { seller: walletAddress },
      ];
    }

    if (state) {
      whereClause.state = state;
    }

    const escrows = await Escrow.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: TransactionLog,
          as: 'transactions',
          limit: 1,
          order: [['createdAt', 'DESC']],
        },
      ],
    });

    res.json({
      success: true,
      data: {
        escrows: escrows.rows,
        total: escrows.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Process auto-release for expired escrows
router.post('/process-expired', async (req, res, next) => {
  try {
    const { adminKey } = req.body;
    
    // Simple admin authentication (in production, use proper auth)
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({
        success: false,
        error: { message: 'Unauthorized' },
      });
    }

    const result = await escrowService.processExpiredEscrows();

    res.json({
      success: true,
      data: {
        processedCount: result.processedCount,
        errors: result.errors,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get escrow statistics
router.get('/stats/overview', async (req, res, next) => {
  try {
    const stats = await escrowService.getEscrowStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;