import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest, schemas } from '../middleware/validation';
import { SolanaService } from '../services/solanaService';
import { DatabaseService, EscrowRecord } from '../services/databaseService';

const router = Router();

// Create new escrow
router.post('/', 
  validateRequest({ body: schemas.createEscrow }),
  asyncHandler(async (req: Request, res: Response) => {
    const solanaService: SolanaService = req.app.locals.solanaService;
    const databaseService: DatabaseService = req.app.locals.databaseService;
    
    const {
      seller,
      tokenMint,
      amount,
      timeoutDuration = 172800, // 48 hours default
      itemDescription,
      fulfillmentLink,
      moderator
    } = req.body;
    
    // In a real implementation, you'd get the buyer's keypair from authentication
    // For demo purposes, we'll return instructions for the frontend to sign
    const escrowId = uuidv4();
    
    const escrowRecord: EscrowRecord = {
      id: escrowId,
      buyer: 'placeholder_buyer', // Would come from auth
      seller,
      moderator: moderator || 'default_moderator',
      tokenMint,
      amount,
      timeoutDuration,
      itemDescription,
      fulfillmentLink,
      state: 'initialized',
      createdAt: Date.now() / 1000
    };
    
    await databaseService.saveEscrow(escrowRecord);
    
    res.json({
      success: true,
      data: {
        escrowId,
        escrow: escrowRecord,
        message: 'Escrow created successfully. Sign the transaction to activate.'
      }
    });
  })
);

// Get escrow by ID
router.get('/:escrowId',
  validateRequest({ params: schemas.escrowId }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { escrowId } = req.params;
    
    const escrow = await databaseService.getEscrow(escrowId);
    
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found'
      });
    }
    
    res.json({
      success: true,
      data: escrow
    });
  })
);

// Release escrow manually by buyer
router.post('/:escrowId/release',
  validateRequest({ params: schemas.escrowId }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { escrowId } = req.params;
    
    const escrow = await databaseService.getEscrow(escrowId);
    
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found'
      });
    }
    
    if (escrow.state !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Escrow is not in active state'
      });
    }
    
    // Update state to released
    await databaseService.updateEscrowState(escrowId, 'released', {
      completedAt: Date.now() / 1000
    });
    
    res.json({
      success: true,
      message: 'Escrow released successfully'
    });
  })
);

// Claim escrow after timeout
router.post('/:escrowId/claim',
  validateRequest({ params: schemas.escrowId }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { escrowId } = req.params;
    
    const escrow = await databaseService.getEscrow(escrowId);
    
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found'
      });
    }
    
    const currentTime = Date.now() / 1000;
    const timeoutReached = currentTime >= (escrow.createdAt + escrow.timeoutDuration);
    
    if (!timeoutReached) {
      return res.status(400).json({
        success: false,
        error: 'Timeout period not reached yet'
      });
    }
    
    if (escrow.state !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Escrow is not in active state'
      });
    }
    
    if (escrow.disputedAt) {
      return res.status(400).json({
        success: false,
        error: 'Cannot claim disputed escrow'
      });
    }
    
    // Update state to claimed
    await databaseService.updateEscrowState(escrowId, 'claimed', {
      completedAt: currentTime
    });
    
    res.json({
      success: true,
      message: 'Escrow claimed successfully'
    });
  })
);

// Create dispute
router.post('/:escrowId/dispute',
  validateRequest({ 
    params: schemas.escrowId,
    body: schemas.createDispute 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { escrowId } = req.params;
    const { reason, evidence } = req.body;
    
    const escrow = await databaseService.getEscrow(escrowId);
    
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found'
      });
    }
    
    if (escrow.state !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Can only dispute active escrows'
      });
    }
    
    if (escrow.disputedAt) {
      return res.status(400).json({
        success: false,
        error: 'Escrow already disputed'
      });
    }
    
    // Update state to disputed
    await databaseService.updateEscrowState(escrowId, 'disputed', {
      disputedAt: Date.now() / 1000,
      disputeReason: reason,
      disputeEvidence: evidence
    });
    
    res.json({
      success: true,
      message: 'Dispute created successfully'
    });
  })
);

// Resolve dispute (moderator only)
router.post('/:escrowId/resolve',
  validateRequest({ 
    params: schemas.escrowId,
    body: schemas.resolveDispute 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { escrowId } = req.params;
    const { releaseToSeller, resolutionNotes } = req.body;
    
    const escrow = await databaseService.getEscrow(escrowId);
    
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found'
      });
    }
    
    if (escrow.state !== 'disputed') {
      return res.status(400).json({
        success: false,
        error: 'Can only resolve disputed escrows'
      });
    }
    
    // TODO: Verify moderator authority
    
    const newState = releaseToSeller ? 'released' : 'cancelled';
    
    await databaseService.updateEscrowState(escrowId, newState, {
      completedAt: Date.now() / 1000,
      resolutionNotes
    });
    
    res.json({
      success: true,
      message: `Dispute resolved - ${releaseToSeller ? 'released to seller' : 'refunded to buyer'}`
    });
  })
);

// Get escrows by buyer
router.get('/buyer/:address',
  validateRequest({ 
    params: schemas.walletAddress,
    query: schemas.pagination 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { address } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);
    const escrows = await databaseService.getEscrowsByBuyer(address, Number(limit), offset);
    
    res.json({
      success: true,
      data: {
        escrows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: escrows.length
        }
      }
    });
  })
);

// Get escrows by seller
router.get('/seller/:address',
  validateRequest({ 
    params: schemas.walletAddress,
    query: schemas.pagination 
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    const { address } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (Number(page) - 1) * Number(limit);
    const escrows = await databaseService.getEscrowsBySeller(address, Number(limit), offset);
    
    res.json({
      success: true,
      data: {
        escrows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: escrows.length
        }
      }
    });
  })
);

// Get escrow statistics
router.get('/stats/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const databaseService: DatabaseService = req.app.locals.databaseService;
    
    const stats = await databaseService.getEscrowStats();
    
    res.json({
      success: true,
      data: stats
    });
  })
);

export default router;