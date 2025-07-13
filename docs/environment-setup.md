# Environment Setup Guide

## Prerequisites

### 1. System Requirements
- Node.js 18+ 
- Rust 1.83.0+
- Solana CLI 1.18+
- Anchor CLI 0.30+
- PostgreSQL 13+

### 2. Development Tools Installation

#### Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update
rustc --version  # Should be 1.83.0+
```

#### Install Solana CLI
```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
export PATH="/home/$USER/.local/share/solana/install/active_release/bin:$PATH"
solana --version
```

#### Install Anchor CLI
```bash
npm install -g @coral-xyz/anchor-cli
anchor --version
```

## Project Setup

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd funhi-escrow-platform
npm install
```

### 2. Solana Configuration
```bash
# Set to devnet for development
solana config set --url devnet
solana config set --keypair ~/.config/solana/id.json

# Create keypair if needed
solana-keygen new

# Fund your wallet (devnet only)
solana airdrop 5
```

### 3. Database Setup
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE funhi_escrow;
CREATE USER funhi_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE funhi_escrow TO funhi_user;
\q
```

### 4. Environment Configuration

#### Backend Environment
```bash
cd backend
cp .env.example .env
# Edit .env file with your specific values
```

Key variables to configure:
- `DB_PASSWORD`: Your PostgreSQL password
- `SOLANA_RPC_URL`: Use devnet for development
- `MODERATOR_PRIVATE_KEY`: Generate a keypair for moderator operations
- `JWT_SECRET`: Generate a secure random string

#### Generate Keypairs for Backend Operations
```bash
# Generate moderator keypair
solana-keygen new --outfile ~/.config/solana/moderator.json
# Extract private key and add to .env as MODERATOR_PRIVATE_KEY

# Generate admin keypair
solana-keygen new --outfile ~/.config/solana/admin.json
# Extract private key and add to .env as ADMIN_PRIVATE_KEY
```

### 5. Smart Contract Deployment

#### Build and Deploy Contract
```bash
cd contract

# Build the contract
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Copy the program ID to backend .env
```

#### Update Program ID
After deployment, update the program ID in:
- `backend/.env` (PROGRAM_ID variable)
- `contract/Anchor.toml` (if different from default)

### 6. Database Migration
```bash
cd backend

# Install dependencies
npm install

# Run database migrations
npm run migrate

# Seed database (optional)
npm run seed
```

## Development Workflow

### 1. Start Local Solana Validator (Alternative to devnet)
```bash
# In one terminal
solana-test-validator

# In another terminal, configure to use local
solana config set --url localhost
```

### 2. Start Development Servers
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend (when implemented)
cd frontend
npm run dev

# Terminal 3: Watch contract changes
cd contract
anchor build --watch
```

### 3. Testing Setup
```bash
# Test smart contract
cd contract
anchor test

# Test backend
cd backend
npm test

# Run integration tests
npm run test:integration
```

## Network Configuration

### Development (Local)
- RPC URL: `http://localhost:8899`
- Cluster: `localnet`
- Fast iteration, full control

### Development (Devnet)
- RPC URL: `https://api.devnet.solana.com`
- Cluster: `devnet`
- Free SOL via airdrop, shared environment

### Staging (Testnet)
- RPC URL: `https://api.testnet.solana.com`
- Cluster: `testnet`
- Production-like environment

### Production (Mainnet)
- RPC URL: `https://api.mainnet-beta.solana.com`
- Cluster: `mainnet-beta`
- Real SOL required, production environment

## Troubleshooting

### Common Issues

#### Rust Version Conflicts
```bash
rustup update
rustup default stable
```

#### Anchor Build Failures
```bash
# Clear build cache
anchor clean
anchor build
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Restart if needed
sudo systemctl restart postgresql
```

#### Solana RPC Issues
```bash
# Check connection
solana cluster-version

# Switch RPC endpoint
solana config set --url <new-rpc-url>
```

### Useful Commands

```bash
# Check Solana configuration
solana config get

# Check wallet balance
solana balance

# View program logs
solana logs <program-id>

# Check anchor workspace
anchor keys list
```

## Security Notes

1. **Never commit private keys** to version control
2. **Use different keypairs** for different environments
3. **Regularly rotate secrets** in production
4. **Enable 2FA** for all external services
5. **Audit smart contracts** before mainnet deployment

## Next Steps

After completing environment setup:
1. Run the test suite to verify everything works
2. Deploy to devnet and test full flow
3. Implement frontend components
4. Conduct security audit
5. Deploy to production