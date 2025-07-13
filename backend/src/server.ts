import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { errorHandler } from './middleware/errorHandler';
import { validateRequest } from './middleware/validation';
import escrowRoutes from './routes/escrow';
import healthRoutes from './routes/health';
import { SolanaService } from './services/solanaService';
import { DatabaseService } from './services/databaseService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
const solanaConnection = new Connection(
  process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

const programId = new PublicKey(
  process.env.PROGRAM_ID || '11111111111111111111111111111111'
);

const solanaService = new SolanaService(solanaConnection, programId);
const databaseService = new DatabaseService(
  process.env.DATABASE_URL || 'sqlite:./data/escrow.db'
);

// Make services available to routes
app.locals.solanaService = solanaService;
app.locals.databaseService = databaseService;

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/escrow', escrowRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await databaseService.initialize();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Funhi Escrow Backend running on port ${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Solana Network: ${process.env.SOLANA_NETWORK || 'devnet'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await databaseService.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await databaseService.close();
  process.exit(0);
});

startServer();

export default app;