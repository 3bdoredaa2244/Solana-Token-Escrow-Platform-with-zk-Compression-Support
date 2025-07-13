const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@coral-xyz/anchor');
const { Escrow, TransactionLog } = require('../database/models');
const { Op } = require('sequelize');

// Import IDL (would be generated from the contract)
const IDL = require('../config/idl.json');

class EscrowService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    this.programId = new PublicKey(process.env.PROGRAM_ID || 'FuNHi9ZbGjE3Tq8W8u9K6V1xZr4H7sTpNqB5dJ3YtL2E');
    
    // In production, use a secure key management solution
    this.payerKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(process.env.PAYER_SECRET_KEY || '[]'))
    );
    
    const provider = new AnchorProvider(this.connection, {
      publicKey: this.payerKeypair.publicKey,
      signTransaction: async (tx) => {
        tx.sign(this.payerKeypair);
        return tx;
      },
      signAllTransactions: async (txs) => {
        txs.forEach(tx => tx.sign(this.payerKeypair));
        return txs;
      },
    }, { commitment: 'confirmed' });
    
    this.program = new Program(IDL, this.programId, provider);
  }

  async createEscrow({
    buyer,
    seller,
    moderator,
    tokenMint,
    amount,
    itemDescription,
    fulfillmentLink,
  }) {
    try {
      const buyerPubkey = new PublicKey(buyer);
      const sellerPubkey = new PublicKey(seller);
      const moderatorPubkey = new PublicKey(moderator);
      const tokenMintPubkey = new PublicKey(tokenMint);

      // Derive escrow and vault PDAs
      const [escrowPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('escrow'),
          buyerPubkey.toBuffer(),
          sellerPubkey.toBuffer(),
          tokenMintPubkey.toBuffer(),
        ],
        this.programId
      );

      const [vaultPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('vault'),
          buyerPubkey.toBuffer(),
          sellerPubkey.toBuffer(),
          tokenMintPubkey.toBuffer(),
        ],
        this.programId
      );

      // Create escrow in database first
      const escrow = await Escrow.create({
        escrowPubkey: escrowPDA.toString(),
        buyer,
        seller,
        moderator,
        tokenMint,
        amount: amount.toString(),
        itemDescription,
        fulfillmentLink,
        state: 'initialized',
      });

      // Call smart contract to initialize escrow
      const tx = await this.program.methods
        .initializeEscrow(
          new BN(amount),
          itemDescription,
          fulfillmentLink
        )
        .accounts({
          escrowAccount: escrowPDA,
          vaultAccount: vaultPDA,
          tokenMint: tokenMintPubkey,
          buyer: buyerPubkey,
          seller: sellerPubkey,
          moderator: moderatorPubkey,
        })
        .rpc();

      // Log transaction
      await TransactionLog.create({
        escrowId: escrow.id,
        signature: tx,
        instruction: 'initialize_escrow',
        status: 'pending',
      });

      // Update escrow with transaction signature
      await escrow.update({ transactionSignature: tx });

      return {
        escrowId: escrow.id,
        escrowPubkey: escrowPDA.toString(),
        transactionSignature: tx,
      };
    } catch (error) {
      console.error('Error creating escrow:', error);
      throw new Error(`Failed to create escrow: ${error.message}`);
    }
  }

  async depositTokens(escrowPubkey, buyerWallet) {
    try {
      const escrow = await Escrow.findOne({ where: { escrowPubkey } });
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.state !== 'initialized') {
        throw new Error('Escrow is not in initialized state');
      }

      const buyerPubkey = new PublicKey(buyerWallet);
      const escrowAccountPubkey = new PublicKey(escrowPubkey);

      // Get buyer's token account
      const buyerTokenAccount = await this.getAssociatedTokenAccount(
        buyerPubkey,
        new PublicKey(escrow.tokenMint)
      );

      // Derive vault PDA
      const [vaultPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('vault'),
          new PublicKey(escrow.buyer).toBuffer(),
          new PublicKey(escrow.seller).toBuffer(),
          new PublicKey(escrow.tokenMint).toBuffer(),
        ],
        this.programId
      );

      const tx = await this.program.methods
        .depositTokens()
        .accounts({
          escrowAccount: escrowAccountPubkey,
          vaultAccount: vaultPDA,
          buyerTokenAccount,
          buyer: buyerPubkey,
        })
        .rpc();

      const disputeDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now

      // Update database
      await escrow.update({
        state: 'deposited',
        depositedAt: new Date(),
        disputeDeadline,
        transactionSignature: tx,
      });

      // Log transaction
      await TransactionLog.create({
        escrowId: escrow.id,
        signature: tx,
        instruction: 'deposit_tokens',
        status: 'pending',
      });

      return {
        transactionSignature: tx,
        disputeDeadline,
      };
    } catch (error) {
      console.error('Error depositing tokens:', error);
      throw new Error(`Failed to deposit tokens: ${error.message}`);
    }
  }

  async releaseTokens(escrowPubkey, buyerWallet) {
    try {
      const escrow = await Escrow.findOne({ where: { escrowPubkey } });
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.state !== 'deposited') {
        throw new Error('Escrow is not in deposited state');
      }

      const buyerPubkey = new PublicKey(buyerWallet);
      const escrowAccountPubkey = new PublicKey(escrowPubkey);

      // Get seller's token account
      const sellerTokenAccount = await this.getAssociatedTokenAccount(
        new PublicKey(escrow.seller),
        new PublicKey(escrow.tokenMint)
      );

      // Derive vault PDA
      const [vaultPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('vault'),
          new PublicKey(escrow.buyer).toBuffer(),
          new PublicKey(escrow.seller).toBuffer(),
          new PublicKey(escrow.tokenMint).toBuffer(),
        ],
        this.programId
      );

      const tx = await this.program.methods
        .releaseTokens()
        .accounts({
          escrowAccount: escrowAccountPubkey,
          vaultAccount: vaultPDA,
          sellerTokenAccount,
          buyer: buyerPubkey,
          seller: new PublicKey(escrow.seller),
        })
        .rpc();

      // Update database
      await escrow.update({
        state: 'released',
        resolvedAt: new Date(),
        transactionSignature: tx,
      });

      // Log transaction
      await TransactionLog.create({
        escrowId: escrow.id,
        signature: tx,
        instruction: 'release_tokens',
        status: 'pending',
      });

      return { transactionSignature: tx };
    } catch (error) {
      console.error('Error releasing tokens:', error);
      throw new Error(`Failed to release tokens: ${error.message}`);
    }
  }

  async raiseDispute(escrowPubkey, buyerWallet, reason) {
    try {
      const escrow = await Escrow.findOne({ where: { escrowPubkey } });
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.state !== 'deposited') {
        throw new Error('Escrow is not in deposited state');
      }

      // Check if dispute period is still active
      if (new Date() >= escrow.disputeDeadline) {
        throw new Error('Dispute period has expired');
      }

      const buyerPubkey = new PublicKey(buyerWallet);
      const escrowAccountPubkey = new PublicKey(escrowPubkey);

      const tx = await this.program.methods
        .raiseDispute(reason)
        .accounts({
          escrowAccount: escrowAccountPubkey,
          buyer: buyerPubkey,
        })
        .rpc();

      // Update database
      await escrow.update({
        state: 'disputed',
        disputedAt: new Date(),
        disputeReason: reason,
        transactionSignature: tx,
      });

      // Log transaction
      await TransactionLog.create({
        escrowId: escrow.id,
        signature: tx,
        instruction: 'raise_dispute',
        status: 'pending',
      });

      return { transactionSignature: tx };
    } catch (error) {
      console.error('Error raising dispute:', error);
      throw new Error(`Failed to raise dispute: ${error.message}`);
    }
  }

  async resolveDispute(escrowPubkey, moderatorWallet, resolution) {
    try {
      const escrow = await Escrow.findOne({ where: { escrowPubkey } });
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.state !== 'disputed') {
        throw new Error('Escrow is not in disputed state');
      }

      if (escrow.moderator !== moderatorWallet) {
        throw new Error('Only the assigned moderator can resolve disputes');
      }

      const moderatorPubkey = new PublicKey(moderatorWallet);
      const escrowAccountPubkey = new PublicKey(escrowPubkey);

      // Derive vault PDA
      const [vaultPDA] = await PublicKey.findProgramAddress(
        [
          Buffer.from('vault'),
          new PublicKey(escrow.buyer).toBuffer(),
          new PublicKey(escrow.seller).toBuffer(),
          new PublicKey(escrow.tokenMint).toBuffer(),
        ],
        this.programId
      );

      let tx;
      let newState;

      if (resolution === 'buyer') {
        // Get buyer's token account for refund
        const buyerTokenAccount = await this.getAssociatedTokenAccount(
          new PublicKey(escrow.buyer),
          new PublicKey(escrow.tokenMint)
        );

        tx = await this.program.methods
          .resolveForBuyer()
          .accounts({
            escrowAccount: escrowAccountPubkey,
            vaultAccount: vaultPDA,
            buyerTokenAccount,
            sellerTokenAccount: await this.getAssociatedTokenAccount(
              new PublicKey(escrow.seller),
              new PublicKey(escrow.tokenMint)
            ),
            moderator: moderatorPubkey,
          })
          .rpc();

        newState = 'refunded';
      } else if (resolution === 'seller') {
        // Get seller's token account
        const sellerTokenAccount = await this.getAssociatedTokenAccount(
          new PublicKey(escrow.seller),
          new PublicKey(escrow.tokenMint)
        );

        tx = await this.program.methods
          .resolveForSeller()
          .accounts({
            escrowAccount: escrowAccountPubkey,
            vaultAccount: vaultPDA,
            buyerTokenAccount: await this.getAssociatedTokenAccount(
              new PublicKey(escrow.buyer),
              new PublicKey(escrow.tokenMint)
            ),
            sellerTokenAccount,
            moderator: moderatorPubkey,
          })
          .rpc();

        newState = 'released';
      } else {
        throw new Error('Invalid resolution. Must be "buyer" or "seller"');
      }

      // Update database
      await escrow.update({
        state: newState,
        resolvedAt: new Date(),
        transactionSignature: tx,
      });

      // Log transaction
      await TransactionLog.create({
        escrowId: escrow.id,
        signature: tx,
        instruction: `resolve_for_${resolution}`,
        status: 'pending',
      });

      return { transactionSignature: tx };
    } catch (error) {
      console.error('Error resolving dispute:', error);
      throw new Error(`Failed to resolve dispute: ${error.message}`);
    }
  }

  async processExpiredEscrows() {
    try {
      const expiredEscrows = await Escrow.findAll({
        where: {
          state: 'deposited',
          disputeDeadline: {
            [Op.lt]: new Date(),
          },
        },
      });

      const results = {
        processedCount: 0,
        errors: [],
      };

      for (const escrow of expiredEscrows) {
        try {
          // Call auto-release on-chain
          const escrowAccountPubkey = new PublicKey(escrow.escrowPubkey);
          
          // Derive vault PDA
          const [vaultPDA] = await PublicKey.findProgramAddress(
            [
              Buffer.from('vault'),
              new PublicKey(escrow.buyer).toBuffer(),
              new PublicKey(escrow.seller).toBuffer(),
              new PublicKey(escrow.tokenMint).toBuffer(),
            ],
            this.programId
          );

          const sellerTokenAccount = await this.getAssociatedTokenAccount(
            new PublicKey(escrow.seller),
            new PublicKey(escrow.tokenMint)
          );

          const tx = await this.program.methods
            .autoReleaseTokens()
            .accounts({
              escrowAccount: escrowAccountPubkey,
              vaultAccount: vaultPDA,
              sellerTokenAccount,
              buyer: new PublicKey(escrow.buyer),
              seller: new PublicKey(escrow.seller),
            })
            .rpc();

          // Update database
          await escrow.update({
            state: 'released',
            resolvedAt: new Date(),
            transactionSignature: tx,
          });

          // Log transaction
          await TransactionLog.create({
            escrowId: escrow.id,
            signature: tx,
            instruction: 'auto_release_tokens',
            status: 'pending',
          });

          results.processedCount++;
        } catch (error) {
          console.error(`Error auto-releasing escrow ${escrow.id}:`, error);
          results.errors.push({
            escrowId: escrow.id,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing expired escrows:', error);
      throw error;
    }
  }

  async getEscrowData(escrowPubkey) {
    try {
      const escrowAccountPubkey = new PublicKey(escrowPubkey);
      const account = await this.program.account.escrowAccount.fetch(escrowAccountPubkey);
      
      return {
        buyer: account.buyer.toString(),
        seller: account.seller.toString(),
        moderator: account.moderator.toString(),
        tokenMint: account.tokenMint.toString(),
        amount: account.amount.toString(),
        itemDescription: account.itemDescription,
        fulfillmentLink: account.fulfillmentLink,
        state: Object.keys(account.state)[0],
        createdAt: new Date(account.createdAt.toNumber() * 1000),
        depositedAt: account.depositedAt.toNumber() > 0 ? new Date(account.depositedAt.toNumber() * 1000) : null,
        disputedAt: account.disputedAt.toNumber() > 0 ? new Date(account.disputedAt.toNumber() * 1000) : null,
        disputeDeadline: account.disputeDeadline.toNumber() > 0 ? new Date(account.disputeDeadline.toNumber() * 1000) : null,
        disputeReason: account.disputeReason,
      };
    } catch (error) {
      console.error('Error fetching escrow data:', error);
      throw new Error(`Failed to fetch escrow data: ${error.message}`);
    }
  }

  async getEscrowStats() {
    try {
      const stats = await Escrow.findAll({
        attributes: [
          'state',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        ],
        group: ['state'],
        raw: true,
      });

      const totalEscrows = await Escrow.count();
      const totalVolume = await Escrow.sum('amount');

      return {
        totalEscrows,
        totalVolume: totalVolume?.toString() || '0',
        byState: stats.reduce((acc, stat) => {
          acc[stat.state] = {
            count: parseInt(stat.count),
            totalAmount: stat.totalAmount?.toString() || '0',
          };
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error('Error getting escrow stats:', error);
      throw error;
    }
  }

  async getAssociatedTokenAccount(owner, mint) {
    const { getAssociatedTokenAddress } = require('@solana/spl-token');
    return await getAssociatedTokenAddress(mint, owner);
  }
}

module.exports = new EscrowService();