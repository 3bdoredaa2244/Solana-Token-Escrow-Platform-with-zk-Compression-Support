# Funhi Platform Escrow System - How It Works

## Overview

The Funhi Platform Escrow System enables secure trading of items with token-bound fulfillment links. It uses a smart contract-based escrow mechanism to ensure both parties are protected during transactions.

## Core Concept

Alice (seller) creates items with token-bound fulfillment links. When Bob (buyer) purchases from Alice:

1. **Bob's tokens are locked in escrow**
2. **Alice provides the item/service**
3. **Tokens are released to Alice** either:
   - Automatically after 48 hours (if no dispute)
   - Manually by Bob (early release)
   - By moderator resolution (if disputed)

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │  Smart Contract │
│   (React)       │◄──►│   (Node.js)     │◄──►│    (Solana)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Database      │
                       │   (SQLite)      │
                       └─────────────────┘
```

## Escrow States

The escrow system manages transactions through these states:

1. **Initialized** - Escrow created, waiting for funds
2. **Active** - Tokens locked, transaction in progress
3. **Disputed** - Buyer raised a dispute
4. **Released** - Tokens released to seller (successful transaction)
5. **Claimed** - Tokens auto-claimed by seller after timeout
6. **Cancelled** - Transaction cancelled, tokens returned to buyer

## Transaction Flow

### 1. Creating an Escrow

```
Alice creates item listing with:
├── Item description
├── Fulfillment link
├── Token amount
├── Timeout duration (default: 48 hours)
└── Optional moderator

Bob initiates purchase:
├── Tokens locked in escrow smart contract
├── Escrow state: Active
└── Timer starts
```

### 2. Fulfillment Phase

```
Alice delivers item/service to Bob

Bob has three options:
├── Release tokens manually (happy path)
├── Wait 48 hours (auto-release)
└── Create dispute (if unsatisfied)
```

### 3. Resolution Scenarios

#### Scenario A: Manual Release (Happy Path)
```
Bob receives item → Bob releases escrow → Alice gets tokens
Timeline: Immediate
```

#### Scenario B: Auto-Release
```
48 hours pass → No dispute raised → Alice can claim tokens
Timeline: 48 hours
```

#### Scenario C: Dispute Resolution
```
Bob creates dispute → Moderator reviews → Decision made
├── Release to Alice (if delivery proven)
└── Refund to Bob (if delivery failed)
```

## Smart Contract Functions

### Core Operations

1. **InitEscrow**
   - Locks buyer's tokens
   - Sets timeout and moderator
   - Records item details

2. **ReleaseEscrow**
   - Manual release by buyer
   - Transfers tokens to seller

3. **ClaimEscrow**
   - Auto-claim after timeout
   - Only if no dispute exists

4. **CreateDispute**
   - Buyer disputes transaction
   - Locks tokens until resolution

5. **ResolveDispute**
   - Moderator resolves dispute
   - Distributes tokens accordingly

6. **CancelEscrow**
   - Returns tokens to buyer
   - Available during dispute or specific conditions

## API Endpoints

### Escrow Management

```bash
# Create new escrow
POST /api/escrow
{
  "seller": "wallet_address",
  "tokenMint": "token_mint_address", 
  "amount": "1000000",
  "itemDescription": "Tesla Model 3",
  "fulfillmentLink": "https://delivery-proof.com/abc123"
}

# Get escrow details
GET /api/escrow/:escrowId

# Release escrow (buyer)
POST /api/escrow/:escrowId/release

# Claim escrow (seller, after timeout)
POST /api/escrow/:escrowId/claim

# Create dispute (buyer)
POST /api/escrow/:escrowId/dispute
{
  "reason": "Item not delivered",
  "evidence": "Photos and tracking info"
}

# Resolve dispute (moderator)
POST /api/escrow/:escrowId/resolve
{
  "releaseToSeller": false,
  "resolutionNotes": "Insufficient delivery proof"
}
```

### Query Operations

```bash
# Get escrows by buyer
GET /api/escrow/buyer/:address?page=1&limit=20

# Get escrows by seller  
GET /api/escrow/seller/:address?page=1&limit=20

# Get system statistics
GET /api/escrow/stats/overview
```

## Security Features

### 1. **Time-based Protection**
- 48-hour timeout ensures transactions don't stay locked forever
- Sellers can claim after timeout if no disputes

### 2. **Dispute Mechanism**
- Buyers can dispute within the active period
- Moderators provide impartial resolution
- Evidence and reasoning required

### 3. **Smart Contract Validation**
- All state transitions validated on-chain
- Cryptographic proof of ownership
- Immutable transaction records

### 4. **Multi-signature Support**
- Program Derived Addresses (PDAs) for escrow authority
- No single point of failure
- Transparent execution

## Token Economics

### For the Funhi Platform

Alice's business model with ACAR token:

1. **Alice mints ACAR tokens** representing her business
2. **Bob buys car + ACAR tokens** in the transaction
3. **Successful transactions pump ACAR price**
4. **More buyers attracted** to rising ACAR value
5. **Alice's business grows** through token appreciation

### Fee Structure

- **Platform Fee**: 0.5% of transaction amount
- **Moderator Fee**: 1% for dispute resolution
- **Gas Fees**: Paid by transaction initiator

## Error Handling

The system handles various error scenarios:

### Contract Errors
- `InvalidAuthority`: Wrong signer for operation
- `TimeoutNotReached`: Premature claim attempt
- `EscrowAlreadyCompleted`: Operation on finalized escrow
- `DisputePeriodActive`: Invalid operation during dispute

### API Errors
- `404`: Escrow not found
- `400`: Invalid state transition
- `403`: Insufficient permissions
- `500`: Internal server error

## Development Setup

### Prerequisites
- Node.js 18+
- Solana CLI tools
- Rust (for smart contract)

### Quick Start

```bash
# Clone and setup
git clone <repository>
cd funhi-escrow-platform

# Install dependencies
npm run install:all

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start development
npm run dev
```

### Smart Contract Deployment

```bash
# Build contract
cd contract
cargo build-bpf

# Deploy to devnet
solana program deploy target/deploy/funhi_escrow.so

# Update PROGRAM_ID in .env
```

## Testing

### Unit Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests  
cd frontend && npm test

# Contract tests
cd contract && cargo test
```

### Integration Testing
```bash
# Full system test
npm run test:integration
```

## Monitoring and Analytics

The system provides comprehensive monitoring:

- **Transaction metrics**: Volume, success rate, dispute rate
- **User analytics**: Active buyers/sellers, retention
- **Performance metrics**: Response times, error rates
- **Financial tracking**: Fees collected, token volumes

## Compliance and Legal

### Regulatory Considerations
- AML/KYC integration points
- Transaction reporting capabilities
- Audit trail maintenance
- Cross-border transaction handling

### Privacy Protection
- Personal data encryption
- GDPR compliance features
- Data retention policies
- User consent management

## Future Enhancements

### Planned Features
1. **Multi-token support** - Accept different SPL tokens
2. **Installment payments** - Partial releases over time
3. **Insurance integration** - Optional transaction insurance
4. **Reputation system** - User trust scores
5. **Mobile application** - Native iOS/Android apps

### Scalability Improvements
1. **Layer 2 integration** - Reduce transaction costs
2. **Batch processing** - Handle multiple escrows efficiently
3. **Caching layer** - Improve API response times
4. **CDN integration** - Global content delivery

## Support and Documentation

- **API Documentation**: `/docs/api`
- **Smart Contract ABI**: `/docs/contract`
- **Troubleshooting Guide**: `/docs/troubleshooting`
- **FAQ**: `/docs/faq`

## Community and Governance

- **Discord**: Community support and discussions
- **GitHub**: Open source contributions
- **DAO**: Governance token for platform decisions
- **Bug Bounty**: Security vulnerability rewards

---

*This documentation serves as a comprehensive guide to understanding and using the Funhi Platform Escrow System. For technical support, please refer to our support channels.*