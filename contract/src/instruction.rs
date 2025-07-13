use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar,
};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum EscrowInstruction {
    /// Initialize a new escrow
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer account
    /// 1. `[]` The seller account
    /// 2. `[writable]` The escrow account to be created
    /// 3. `[]` The token mint
    /// 4. `[writable]` The buyer's token account
    /// 5. `[writable]` The escrow's token account
    /// 6. `[]` The moderator account
    /// 7. `[]` The token program id
    /// 8. `[]` The system program id
    /// 9. `[]` The rent sysvar
    InitEscrow {
        amount: u64,
        timeout_duration: i64, // Duration in seconds (48 hours = 172800)
        item_description: String,
        fulfillment_link: String,
    },

    /// Release escrow manually by buyer
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer account
    /// 1. `[writable]` The escrow account
    /// 2. `[writable]` The seller's token account
    /// 3. `[writable]` The escrow's token account
    /// 4. `[]` The token program id
    ReleaseEscrow,

    /// Claim escrow automatically after timeout
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The seller account
    /// 1. `[writable]` The escrow account
    /// 2. `[writable]` The seller's token account
    /// 3. `[writable]` The escrow's token account
    /// 4. `[]` The token program id
    /// 5. `[]` The clock sysvar
    ClaimEscrow,

    /// Create a dispute
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer account
    /// 1. `[writable]` The escrow account
    /// 2. `[]` The clock sysvar
    CreateDispute {
        reason: String,
        evidence: String,
    },

    /// Resolve dispute (moderator only)
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The moderator account
    /// 1. `[writable]` The escrow account
    /// 2. `[writable]` The winner's token account (buyer or seller)
    /// 3. `[writable]` The escrow's token account
    /// 4. `[]` The token program id
    ResolveDispute {
        release_to_seller: bool,
        resolution_notes: String,
    },

    /// Cancel escrow (only before timeout or during dispute)
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The buyer account
    /// 1. `[writable]` The escrow account
    /// 2. `[writable]` The buyer's token account
    /// 3. `[writable]` The escrow's token account
    /// 4. `[]` The token program id
    CancelEscrow,
}

impl EscrowInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        Self::try_from_slice(input).map_err(|_| ProgramError::InvalidInstructionData)
    }

    pub fn pack(&self) -> Vec<u8> {
        self.try_to_vec().unwrap()
    }
}

/// Creates an `InitEscrow` instruction
pub fn init_escrow(
    program_id: &Pubkey,
    buyer: &Pubkey,
    seller: &Pubkey,
    escrow: &Pubkey,
    token_mint: &Pubkey,
    buyer_token_account: &Pubkey,
    escrow_token_account: &Pubkey,
    moderator: &Pubkey,
    amount: u64,
    timeout_duration: i64,
    item_description: String,
    fulfillment_link: String,
) -> Result<Instruction, ProgramError> {
    let data = EscrowInstruction::InitEscrow {
        amount,
        timeout_duration,
        item_description,
        fulfillment_link,
    };

    let accounts = vec![
        AccountMeta::new(*buyer, true),
        AccountMeta::new_readonly(*seller, false),
        AccountMeta::new(*escrow, false),
        AccountMeta::new_readonly(*token_mint, false),
        AccountMeta::new(*buyer_token_account, false),
        AccountMeta::new(*escrow_token_account, false),
        AccountMeta::new_readonly(*moderator, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(solana_program::system_program::id(), false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: data.pack(),
    })
}

/// Creates a `ReleaseEscrow` instruction
pub fn release_escrow(
    program_id: &Pubkey,
    buyer: &Pubkey,
    escrow: &Pubkey,
    seller_token_account: &Pubkey,
    escrow_token_account: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = EscrowInstruction::ReleaseEscrow;

    let accounts = vec![
        AccountMeta::new(*buyer, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*seller_token_account, false),
        AccountMeta::new(*escrow_token_account, false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: data.pack(),
    })
}

/// Creates a `ClaimEscrow` instruction
pub fn claim_escrow(
    program_id: &Pubkey,
    seller: &Pubkey,
    escrow: &Pubkey,
    seller_token_account: &Pubkey,
    escrow_token_account: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let data = EscrowInstruction::ClaimEscrow;

    let accounts = vec![
        AccountMeta::new(*seller, true),
        AccountMeta::new(*escrow, false),
        AccountMeta::new(*seller_token_account, false),
        AccountMeta::new(*escrow_token_account, false),
        AccountMeta::new_readonly(spl_token::id(), false),
        AccountMeta::new_readonly(sysvar::clock::id(), false),
    ];

    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data: data.pack(),
    })
}