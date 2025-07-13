const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://localhost:5432/funhi_escrow',
  {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Escrow model to track on-chain escrow states
const Escrow = sequelize.define('Escrow', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  escrowPubkey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'On-chain escrow account public key',
  },
  buyer: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Buyer wallet public key',
  },
  seller: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Seller wallet public key',
  },
  moderator: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Moderator wallet public key',
  },
  tokenMint: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Token mint address',
  },
  amount: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'Amount in smallest token units',
  },
  itemDescription: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  fulfillmentLink: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  state: {
    type: DataTypes.ENUM('initialized', 'deposited', 'disputed', 'released', 'refunded'),
    allowNull: false,
    defaultValue: 'initialized',
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  depositedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  disputedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  disputeDeadline: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  disputeReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  transactionSignature: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Latest transaction signature',
  },
}, {
  indexes: [
    {
      fields: ['buyer'],
    },
    {
      fields: ['seller'],
    },
    {
      fields: ['state'],
    },
    {
      fields: ['disputeDeadline'],
    },
  ],
});

// Transaction log to track all blockchain interactions
const TransactionLog = sequelize.define('TransactionLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  escrowId: {
    type: DataTypes.UUID,
    references: {
      model: Escrow,
      key: 'id',
    },
    allowNull: false,
  },
  signature: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  instruction: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'The instruction that was called',
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  blockTime: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  indexes: [
    {
      fields: ['escrowId'],
    },
    {
      fields: ['signature'],
    },
    {
      fields: ['status'],
    },
  ],
});

// Define associations
Escrow.hasMany(TransactionLog, {
  foreignKey: 'escrowId',
  as: 'transactions',
});

TransactionLog.belongsTo(Escrow, {
  foreignKey: 'escrowId',
  as: 'escrow',
});

// Initialize database
async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Sync models (create tables if they don't exist)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('Database models synchronized.');
    
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  Escrow,
  TransactionLog,
  initDatabase,
};