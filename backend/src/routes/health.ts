import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { DatabaseService } from '../services/databaseService';

const router = Router();

// Simple health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Funhi Escrow API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const databaseService: DatabaseService = req.app.locals.databaseService;
  
  try {
    // Check database connection
    const stats = await databaseService.getEscrowStats();
    
    res.json({
      success: true,
      message: 'All systems operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: {
          status: 'healthy',
          stats
        },
        api: {
          status: 'healthy',
          uptime: process.uptime()
        }
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Service degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'unhealthy',
          error: (error as Error).message
        },
        api: {
          status: 'healthy',
          uptime: process.uptime()
        }
      }
    });
  }
}));

export default router;