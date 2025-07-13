import sqlite3 from 'sqlite3';
import { AppError } from '../middleware/errorHandler';

export interface EscrowRecord {
  id: string;
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
  transactionSignature?: string;
}

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath.replace('sqlite:', '');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(new AppError(`Failed to connect to database: ${err.message}`, 500));
          return;
        }
        
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    const createEscrowsTable = `
      CREATE TABLE IF NOT EXISTS escrows (
        id TEXT PRIMARY KEY,
        buyer TEXT NOT NULL,
        seller TEXT NOT NULL,
        moderator TEXT NOT NULL,
        tokenMint TEXT NOT NULL,
        amount TEXT NOT NULL,
        timeoutDuration INTEGER NOT NULL,
        itemDescription TEXT NOT NULL,
        fulfillmentLink TEXT NOT NULL,
        state TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        disputedAt INTEGER,
        completedAt INTEGER,
        disputeReason TEXT,
        disputeEvidence TEXT,
        resolutionNotes TEXT,
        transactionSignature TEXT,
        updatedAt INTEGER DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_escrows_buyer ON escrows(buyer)',
      'CREATE INDEX IF NOT EXISTS idx_escrows_seller ON escrows(seller)',
      'CREATE INDEX IF NOT EXISTS idx_escrows_state ON escrows(state)',
      'CREATE INDEX IF NOT EXISTS idx_escrows_created_at ON escrows(createdAt)'
    ];

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.serialize(() => {
        this.db!.run(createEscrowsTable, (err) => {
          if (err) {
            reject(new AppError(`Failed to create escrows table: ${err.message}`, 500));
            return;
          }
        });

        // Create indexes
        createIndexes.forEach(indexSql => {
          this.db!.run(indexSql);
        });

        resolve();
      });
    });
  }

  async saveEscrow(escrow: EscrowRecord): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO escrows (
        id, buyer, seller, moderator, tokenMint, amount, timeoutDuration,
        itemDescription, fulfillmentLink, state, createdAt, disputedAt,
        completedAt, disputeReason, disputeEvidence, resolutionNotes,
        transactionSignature, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.run(sql, [
        escrow.id,
        escrow.buyer,
        escrow.seller,
        escrow.moderator,
        escrow.tokenMint,
        escrow.amount,
        escrow.timeoutDuration,
        escrow.itemDescription,
        escrow.fulfillmentLink,
        escrow.state,
        escrow.createdAt,
        escrow.disputedAt,
        escrow.completedAt,
        escrow.disputeReason,
        escrow.disputeEvidence,
        escrow.resolutionNotes,
        escrow.transactionSignature
      ], (err) => {
        if (err) {
          reject(new AppError(`Failed to save escrow: ${err.message}`, 500));
        } else {
          resolve();
        }
      });
    });
  }

  async getEscrow(id: string): Promise<EscrowRecord | null> {
    const sql = 'SELECT * FROM escrows WHERE id = ?';

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(new AppError(`Failed to get escrow: ${err.message}`, 500));
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getEscrowsByBuyer(
    buyer: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<EscrowRecord[]> {
    const sql = 'SELECT * FROM escrows WHERE buyer = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?';

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.all(sql, [buyer, limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`Failed to get escrows by buyer: ${err.message}`, 500));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getEscrowsBySeller(
    seller: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<EscrowRecord[]> {
    const sql = 'SELECT * FROM escrows WHERE seller = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?';

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.all(sql, [seller, limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`Failed to get escrows by seller: ${err.message}`, 500));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getEscrowsByState(
    state: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<EscrowRecord[]> {
    const sql = 'SELECT * FROM escrows WHERE state = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?';

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.all(sql, [state, limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(new AppError(`Failed to get escrows by state: ${err.message}`, 500));
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async updateEscrowState(id: string, state: string, additionalData?: Partial<EscrowRecord>): Promise<void> {
    let sql = 'UPDATE escrows SET state = ?, updatedAt = CURRENT_TIMESTAMP';
    const params: any[] = [state];

    if (additionalData) {
      const updates = Object.keys(additionalData).filter(key => key !== 'id');
      if (updates.length > 0) {
        sql += ', ' + updates.map(key => `${key} = ?`).join(', ');
        params.push(...updates.map(key => (additionalData as any)[key]));
      }
    }

    sql += ' WHERE id = ?';
    params.push(id);

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.run(sql, params, (err) => {
        if (err) {
          reject(new AppError(`Failed to update escrow state: ${err.message}`, 500));
        } else {
          resolve();
        }
      });
    });
  }

  async getEscrowStats(): Promise<{
    total: number;
    active: number;
    completed: number;
    disputed: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN state = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN state IN ('released', 'claimed') THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN state = 'disputed' THEN 1 ELSE 0 END) as disputed
      FROM escrows
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new AppError('Database not initialized', 500));
        return;
      }

      this.db.get(sql, [], (err, row: any) => {
        if (err) {
          reject(new AppError(`Failed to get escrow stats: ${err.message}`, 500));
        } else {
          resolve(row || { total: 0, active: 0, completed: 0, disputed: 0 });
        }
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          reject(new AppError(`Failed to close database: ${err.message}`, 500));
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}