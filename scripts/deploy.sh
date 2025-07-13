#!/bin/bash

# Funhi Platform Escrow System Deployment Script
set -e

echo "🚀 Starting deployment of Funhi Escrow Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ and try again."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm and try again."
        exit 1
    fi
    
    # Check Rust
    if ! command -v cargo &> /dev/null; then
        print_error "Rust is not installed. Please install Rust and try again."
        exit 1
    fi
    
    # Check Solana CLI
    if ! command -v solana &> /dev/null; then
        print_warning "Solana CLI is not installed. Some features may not work."
    fi
    
    print_status "Prerequisites check completed ✅"
}

# Setup environment
setup_environment() {
    print_status "Setting up environment..."
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            print_status "Created .env file from template"
            print_warning "Please edit .env file with your configuration before continuing"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    else
        print_status "Environment file already exists"
    fi
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Root dependencies
    npm install
    
    # Backend dependencies
    if [ -d "backend" ]; then
        cd backend
        npm install
        cd ..
        print_status "Backend dependencies installed ✅"
    fi
    
    # Frontend dependencies
    if [ -d "frontend" ]; then
        cd frontend
        npm install
        cd ..
        print_status "Frontend dependencies installed ✅"
    fi
}

# Build smart contract
build_contract() {
    print_status "Building smart contract..."
    
    if [ -d "contract" ]; then
        cd contract
        
        # Check if cargo build-bpf is available
        if cargo build-bpf --version &> /dev/null; then
            cargo build-bpf
            print_status "Smart contract built successfully ✅"
        else
            print_warning "cargo build-bpf not available, using regular build"
            cargo build --release
        fi
        
        cd ..
    else
        print_warning "Contract directory not found, skipping contract build"
    fi
}

# Deploy smart contract
deploy_contract() {
    print_status "Checking smart contract deployment..."
    
    if command -v solana &> /dev/null; then
        # Check if we're connected to devnet
        network=$(solana config get | grep "RPC URL" | awk '{print $3}')
        print_status "Current Solana network: $network"
        
        if [ -f "contract/target/deploy/funhi_escrow.so" ]; then
            print_status "Smart contract binary found"
            print_warning "To deploy, run: solana program deploy contract/target/deploy/funhi_escrow.so"
        else
            print_warning "Smart contract binary not found. Build the contract first."
        fi
    else
        print_warning "Solana CLI not available. Contract deployment skipped."
    fi
}

# Build backend
build_backend() {
    print_status "Building backend..."
    
    if [ -d "backend" ]; then
        cd backend
        npm run build
        cd ..
        print_status "Backend built successfully ✅"
    fi
}

# Build frontend
build_frontend() {
    print_status "Building frontend..."
    
    if [ -d "frontend" ]; then
        cd frontend
        
        # Create basic index.html if it doesn't exist
        if [ ! -f "index.html" ]; then
            cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Funhi Escrow Platform</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
        fi
        
        # Create basic TypeScript config if it doesn't exist
        if [ ! -f "tsconfig.json" ]; then
            cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF
        fi
        
        # Create basic Vite config if it doesn't exist
        if [ ! -f "vite.config.ts" ]; then
            cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  }
})
EOF
        fi
        
        print_status "Frontend configuration created"
        cd ..
    fi
}

# Create data directories
create_directories() {
    print_status "Creating data directories..."
    
    mkdir -p data
    mkdir -p logs
    
    print_status "Directories created ✅"
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check if all required files exist
    local errors=0
    
    if [ ! -f ".env" ]; then
        print_error "Missing .env file"
        errors=$((errors + 1))
    fi
    
    if [ ! -d "backend" ]; then
        print_error "Missing backend directory"
        errors=$((errors + 1))
    fi
    
    if [ ! -d "frontend" ]; then
        print_error "Missing frontend directory"
        errors=$((errors + 1))
    fi
    
    if [ ! -d "contract" ]; then
        print_warning "Missing contract directory"
    fi
    
    if [ $errors -eq 0 ]; then
        print_status "Deployment verification completed ✅"
        return 0
    else
        print_error "Deployment verification failed with $errors errors"
        return 1
    fi
}

# Print next steps
print_next_steps() {
    print_status "🎉 Deployment completed!"
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Deploy smart contract: solana program deploy contract/target/deploy/funhi_escrow.so"
    echo "3. Update PROGRAM_ID in .env with your deployed contract address"
    echo "4. Start the development servers:"
    echo "   - Backend: cd backend && npm run dev"
    echo "   - Frontend: cd frontend && npm run dev"
    echo ""
    echo "📚 Documentation: docs/HOW_IT_WORKS.md"
    echo "🐛 Issues: https://github.com/funhi-platform/escrow-system/issues"
    echo ""
    echo "Happy trading! 🚀"
}

# Main execution
main() {
    echo "=================================================="
    echo "🏗️  Funhi Platform Escrow System Deployment"
    echo "=================================================="
    echo ""
    
    check_prerequisites
    setup_environment
    install_dependencies
    create_directories
    build_contract
    deploy_contract
    build_backend
    build_frontend
    
    if verify_deployment; then
        print_next_steps
    else
        print_error "Deployment failed. Please check the errors above."
        exit 1
    fi
}

# Run main function
main "$@"