# Funhi Platform Escrow System

An escrow system for the Funhi platform that enables secure trading of items with token-bound fulfillment links. When Bob buys from Alice, his tokens are escrowed until either:
- 48 hours pass without dispute
- Bob manually releases the escrow
- A moderator resolves a dispute

## Architecture

- **Smart Contract**: Escrow logic handling token locking/releasing
- **Backend**: API service for managing escrow operations
- **Frontend**: Web interface for users and moderators

## Features

- ✅ Token locking mechanism
- ✅ Automatic release after 48 hours
- ✅ Manual release by buyer
- ✅ Dispute handling with moderator intervention
- ✅ Proof of delivery verification

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Start development
npm run dev
```

## Project Structure

```
├── contract/           # Solana smart contract (Anchor)
├── backend/           # Node.js API server
├── frontend/          # React web application
├── scripts/           # Deployment and utility scripts
└── docs/             # Documentation
```

## How It Works

1. **Item Listing**: Alice creates items with token-bound fulfillment links
2. **Purchase**: Bob initiates purchase, tokens get locked in escrow
3. **Fulfillment**: Alice provides item/service to Bob
4. **Resolution**: 
   - Auto-release after 48 hours (no dispute)
   - Manual release by Bob
   - Moderator resolution if disputed

## Development

See individual README files in each directory for specific setup instructions.