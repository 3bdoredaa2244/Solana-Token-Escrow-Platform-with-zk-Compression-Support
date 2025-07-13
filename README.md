# Funhi Escrow Platform

A decentralized escrow system for the funhi marketplace where sellers mint tokens tied to their business success and buyers purchase both items and tokens that appreciate with the seller's business growth.

## 🎯 Overview

The funhi platform creates a unique tokenized marketplace where:
- **Sellers** mint tokens (e.g., ACAR for a car dealer Alice) tied to their business
- **Buyers** purchase items AND pump the seller's token price  
- **Token value** increases with each successful sale, creating investment opportunities
- **Escrow system** ensures secure transactions with automatic release and dispute resolution

## 🔧 Architecture

### Smart Contract (Solana + ZK Compression)
- **Escrow Logic**: Initialize, deposit, release, dispute resolution
- **Timer Mechanism**: 48-hour automatic release
- **Moderator System**: Dispute resolution with proof requirements
- **ZK Compression**: Cost-efficient token operations

### Backend (Node.js + Express)
- REST API for escrow management
- Automated timer processing  
- Blockchain integration
- Database for state tracking

### Frontend (React + Vite)
- Wallet connection (Phantom, Solflare)
- Escrow creation interface
- Transaction monitoring
- Dispute resolution UI

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start local Solana validator
solana-test-validator

# Deploy smart contract
anchor deploy

# Start backend
npm run backend

# Start frontend
npm run frontend
```

## 📝 How It Works

### Example Scenario
1. **Alice** (car dealer) mints ACAR tokens tied to her business
2. **Bob** wants to buy a car from Alice
3. **Escrow Creation**: Bob locks tokens for the car purchase
4. **Delivery**: Alice provides the car + fulfillment link
5. **Release Conditions**:
   - ✅ 48 hours pass without dispute → Auto-release to Alice
   - ✅ Bob manually releases → Immediate release to Alice  
   - ⚠️ Dispute raised → Moderator intervention required

### State Flow
```
Initialized → Deposited → [Timer: 48h] → Released
                    ↓
                 Disputed → Moderator Review → Resolution
```

## 🛠 Tech Stack

- **Blockchain**: Solana with ZK Compression
- **Smart Contracts**: Anchor Framework
- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: React + TypeScript + Vite
- **Wallet**: Phantom/Solflare integration

## 📊 Cost Efficiency

Using ZK Compression provides massive cost savings:
- Regular Solana accounts: ~0.002 SOL per token account
- ZK Compressed accounts: ~0.00001 SOL per token account  
- **160x cheaper** for token operations!

## 🔐 Security Features

- Program Derived Addresses (PDAs) for secure escrow vaults
- Multi-signature moderator system
- Automated dispute timeouts
- Comprehensive input validation
- Real-time transaction monitoring

## 📚 API Documentation

Coming soon - comprehensive REST API docs for integration

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details