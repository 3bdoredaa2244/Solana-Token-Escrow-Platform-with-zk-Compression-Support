use thiserror::Error;
use solana_program::program_error::ProgramError;

#[derive(Error, Debug, Copy, Clone)]
pub enum EscrowError {
    #[error("Invalid Instruction")]
    InvalidInstruction,
    
    #[error("Not Rent Exempt")]
    NotRentExempt,
    
    #[error("Expected Amount Mismatch")]
    ExpectedAmountMismatch,
    
    #[error("Amount Overflow")]
    AmountOverflow,
    
    #[error("Invalid Authority")]
    InvalidAuthority,
    
    #[error("Escrow Not Initialized")]
    EscrowNotInitialized,
    
    #[error("Escrow Already Completed")]
    EscrowAlreadyCompleted,
    
    #[error("Dispute Period Active")]
    DisputePeriodActive,
    
    #[error("Cannot Dispute After Release")]
    CannotDisputeAfterRelease,
    
    #[error("Timeout Not Reached")]
    TimeoutNotReached,
    
    #[error("Invalid Moderator")]
    InvalidModerator,
    
    #[error("Insufficient Funds")]
    InsufficientFunds,
    
    #[error("Token Account Not Found")]
    TokenAccountNotFound,
    
    #[error("Invalid Token Mint")]
    InvalidTokenMint,
    
    #[error("Invalid Account Owner")]
    InvalidAccountOwner,
}

impl From<EscrowError> for ProgramError {
    fn from(e: EscrowError) -> Self {
        ProgramError::Custom(e as u32)
    }
}