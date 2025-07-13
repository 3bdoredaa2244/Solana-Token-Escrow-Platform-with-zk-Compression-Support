import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { AppError } from '../middleware/errorHandler';

export interface EscrowData {
  buyer: string;
  seller: string;
  moderator: string;
  tokenMint: string;
  amount: string;
  timeoutDuration: number;
  itemDescription: string;
  fulfillmentLink: string;
  state: string;
  createdAt: number;
  disputedAt?: number;
  completedAt?: number;
  disputeReason?: string;
  disputeEvidence?: string;
  resolutionNotes?: string;
}

export class SolanaService {
  private connection: Connection;
  private programId: PublicKey;

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this.programId = programId;
  }

  /**
   * Create a new escrow
   */
  async createEscrow(
    buyerKeypair: Keypair,
    seller: PublicKey,
    tokenMint: PublicKey,
    amount: bigint,
    timeoutDuration: number,
    itemDescription: string,
    fulfillmentLink: string,
    moderator?: PublicKey
  ): Promise<{ signature: string; escrowAccount: PublicKey }> {
    try {
      // Generate escrow account
      const escrowKeypair = Keypair.generate();
      
      // Get or create associated token accounts
      const buyerTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        buyerKeypair.publicKey
      );
      
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        escrowKeypair.publicKey
      );

      // Use default moderator if not provided
      const escrowModerator = moderator || new PublicKey('11111111111111111111111111111111');

      // Create transaction
      const transaction = new Transaction();
      
      // Create escrow token account
      transaction.add(
        createAssociatedTokenAccountInstruction(
          buyerKeypair.publicKey,
          escrowTokenAccount,
          escrowKeypair.publicKey,
          tokenMint
        )
      );

      // Create init escrow instruction
      const initEscrowInstruction = await this.createInitEscrowInstruction(
        buyerKeypair.publicKey,
        seller,
        escrowKeypair.publicKey,
        tokenMint,
        buyerTokenAccount,
        escrowTokenAccount,
        escrowModerator,
        amount,
        timeoutDuration,
        itemDescription,
        fulfillmentLink
      );

      transaction.add(initEscrowInstruction);

      // Send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [buyerKeypair, escrowKeypair],
        { commitment: 'confirmed' }
      );

      return {
        signature,
        escrowAccount: escrowKeypair.publicKey
      };
    } catch (error) {
      throw new AppError(`Failed to create escrow: ${error}`, 500);
    }
  }

  /**
   * Release escrow manually by buyer
   */
  async releaseEscrow(
    buyerKeypair: Keypair,
    escrowAccount: PublicKey,
    seller: PublicKey,
    tokenMint: PublicKey
  ): Promise<string> {
    try {
      const sellerTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        seller
      );
      
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        escrowAccount
      );

      const instruction = await this.createReleaseEscrowInstruction(
        buyerKeypair.publicKey,
        escrowAccount,
        sellerTokenAccount,
        escrowTokenAccount
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [buyerKeypair],
        { commitment: 'confirmed' }
      );

      return signature;
    } catch (error) {
      throw new AppError(`Failed to release escrow: ${error}`, 500);
    }
  }

  /**
   * Claim escrow after timeout
   */
  async claimEscrow(
    sellerKeypair: Keypair,
    escrowAccount: PublicKey,
    tokenMint: PublicKey
  ): Promise<string> {
    try {
      const sellerTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        sellerKeypair.publicKey
      );
      
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        escrowAccount
      );

      const instruction = await this.createClaimEscrowInstruction(
        sellerKeypair.publicKey,
        escrowAccount,
        sellerTokenAccount,
        escrowTokenAccount
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [sellerKeypair],
        { commitment: 'confirmed' }
      );

      return signature;
    } catch (error) {
      throw new AppError(`Failed to claim escrow: ${error}`, 500);
    }
  }

  /**
   * Create a dispute
   */
  async createDispute(
    buyerKeypair: Keypair,
    escrowAccount: PublicKey,
    reason: string,
    evidence: string
  ): Promise<string> {
    try {
      const instruction = await this.createDisputeInstruction(
        buyerKeypair.publicKey,
        escrowAccount,
        reason,
        evidence
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [buyerKeypair],
        { commitment: 'confirmed' }
      );

      return signature;
    } catch (error) {
      throw new AppError(`Failed to create dispute: ${error}`, 500);
    }
  }

  /**
   * Resolve dispute (moderator only)
   */
  async resolveDispute(
    moderatorKeypair: Keypair,
    escrowAccount: PublicKey,
    winner: PublicKey,
    tokenMint: PublicKey,
    releaseToSeller: boolean,
    resolutionNotes: string
  ): Promise<string> {
    try {
      const winnerTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        winner
      );
      
      const escrowTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        escrowAccount
      );

      const instruction = await this.createResolveDisputeInstruction(
        moderatorKeypair.publicKey,
        escrowAccount,
        winnerTokenAccount,
        escrowTokenAccount,
        releaseToSeller,
        resolutionNotes
      );

      const transaction = new Transaction().add(instruction);
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [moderatorKeypair],
        { commitment: 'confirmed' }
      );

      return signature;
    } catch (error) {
      throw new AppError(`Failed to resolve dispute: ${error}`, 500);
    }
  }

  /**
   * Get escrow account data
   */
  async getEscrowData(escrowAccount: PublicKey): Promise<EscrowData | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(escrowAccount);
      
      if (!accountInfo) {
        return null;
      }

      // Parse account data (this would need to match the on-chain data structure)
      // For now, returning mock data structure
      return {
        buyer: 'placeholder',
        seller: 'placeholder',
        moderator: 'placeholder',
        tokenMint: 'placeholder',
        amount: '0',
        timeoutDuration: 172800,
        itemDescription: 'placeholder',
        fulfillmentLink: 'placeholder',
        state: 'active',
        createdAt: Date.now() / 1000
      };
    } catch (error) {
      throw new AppError(`Failed to get escrow data: ${error}`, 500);
    }
  }

  private async createInitEscrowInstruction(
    buyer: PublicKey,
    seller: PublicKey,
    escrow: PublicKey,
    tokenMint: PublicKey,
    buyerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
    moderator: PublicKey,
    amount: bigint,
    timeoutDuration: number,
    itemDescription: string,
    fulfillmentLink: string
  ): Promise<TransactionInstruction> {
    // This would create the actual instruction data based on your program's interface
    // For now, returning a placeholder instruction
    return new TransactionInstruction({
      keys: [
        { pubkey: buyer, isSigner: true, isWritable: false },
        { pubkey: seller, isSigner: false, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
        { pubkey: moderator, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([0]) // Placeholder instruction data
    });
  }

  private async createReleaseEscrowInstruction(
    buyer: PublicKey,
    escrow: PublicKey,
    sellerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey
  ): Promise<TransactionInstruction> {
    return new TransactionInstruction({
      keys: [
        { pubkey: buyer, isSigner: true, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([1]) // Placeholder instruction data
    });
  }

  private async createClaimEscrowInstruction(
    seller: PublicKey,
    escrow: PublicKey,
    sellerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey
  ): Promise<TransactionInstruction> {
    return new TransactionInstruction({
      keys: [
        { pubkey: seller, isSigner: true, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([2]) // Placeholder instruction data
    });
  }

  private async createDisputeInstruction(
    buyer: PublicKey,
    escrow: PublicKey,
    reason: string,
    evidence: string
  ): Promise<TransactionInstruction> {
    return new TransactionInstruction({
      keys: [
        { pubkey: buyer, isSigner: true, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([3]) // Placeholder instruction data
    });
  }

  private async createResolveDisputeInstruction(
    moderator: PublicKey,
    escrow: PublicKey,
    winnerTokenAccount: PublicKey,
    escrowTokenAccount: PublicKey,
    releaseToSeller: boolean,
    resolutionNotes: string
  ): Promise<TransactionInstruction> {
    return new TransactionInstruction({
      keys: [
        { pubkey: moderator, isSigner: true, isWritable: false },
        { pubkey: escrow, isSigner: false, isWritable: true },
        { pubkey: winnerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: escrowTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: Buffer.from([4]) // Placeholder instruction data
    });
  }
}