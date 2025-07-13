use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    clock::UnixTimestamp,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum EscrowState {
    Uninitialized,
    Initialized,
    Active,
    Disputed,
    Released,
    Claimed,
    Cancelled,
}

impl Default for EscrowState {
    fn default() -> Self {
        EscrowState::Uninitialized
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct EscrowAccount {
    /// Current state of the escrow
    pub state: EscrowState,
    
    /// The buyer who initiated the escrow
    pub buyer: Pubkey,
    
    /// The seller who will receive tokens upon completion
    pub seller: Pubkey,
    
    /// The moderator who can resolve disputes
    pub moderator: Pubkey,
    
    /// The mint of the token being escrowed
    pub token_mint: Pubkey,
    
    /// The escrow's token account that holds the funds
    pub escrow_token_account: Pubkey,
    
    /// Amount of tokens in escrow
    pub amount: u64,
    
    /// Timestamp when escrow was created
    pub created_at: UnixTimestamp,
    
    /// Timeout duration in seconds (default 48 hours = 172800)
    pub timeout_duration: i64,
    
    /// Timestamp when dispute was created (if any)
    pub disputed_at: Option<UnixTimestamp>,
    
    /// Timestamp when escrow was completed
    pub completed_at: Option<UnixTimestamp>,
    
    /// Description of the item/service being traded
    pub item_description: String,
    
    /// Link to fulfillment information or proof
    pub fulfillment_link: String,
    
    /// Dispute reason (if disputed)
    pub dispute_reason: Option<String>,
    
    /// Evidence provided for dispute
    pub dispute_evidence: Option<String>,
    
    /// Resolution notes from moderator
    pub resolution_notes: Option<String>,
}

impl EscrowAccount {
    pub const LEN: usize = 32 + // state (enum discriminant + data)
        32 + // buyer
        32 + // seller  
        32 + // moderator
        32 + // token_mint
        32 + // escrow_token_account
        8 +  // amount
        8 +  // created_at
        8 +  // timeout_duration
        9 +  // disputed_at (1 + 8)
        9 +  // completed_at (1 + 8)
        4 + 256 + // item_description (4 bytes length + max 256 chars)
        4 + 512 + // fulfillment_link (4 bytes length + max 512 chars)
        4 + 512 + // dispute_reason (4 bytes length + max 512 chars)
        4 + 1024 + // dispute_evidence (4 bytes length + max 1024 chars)
        4 + 512; // resolution_notes (4 bytes length + max 512 chars)

    pub fn new(
        buyer: Pubkey,
        seller: Pubkey,
        moderator: Pubkey,
        token_mint: Pubkey,
        escrow_token_account: Pubkey,
        amount: u64,
        timeout_duration: i64,
        item_description: String,
        fulfillment_link: String,
        created_at: UnixTimestamp,
    ) -> Self {
        Self {
            state: EscrowState::Initialized,
            buyer,
            seller,
            moderator,
            token_mint,
            escrow_token_account,
            amount,
            created_at,
            timeout_duration,
            disputed_at: None,
            completed_at: None,
            item_description,
            fulfillment_link,
            dispute_reason: None,
            dispute_evidence: None,
            resolution_notes: None,
        }
    }

    pub fn is_timeout_reached(&self, current_time: UnixTimestamp) -> bool {
        current_time >= self.created_at + self.timeout_duration
    }

    pub fn can_be_claimed(&self, current_time: UnixTimestamp) -> bool {
        matches!(self.state, EscrowState::Active) && 
        self.is_timeout_reached(current_time) &&
        self.disputed_at.is_none()
    }

    pub fn can_be_disputed(&self) -> bool {
        matches!(self.state, EscrowState::Active) && 
        self.disputed_at.is_none() &&
        self.completed_at.is_none()
    }

    pub fn activate(&mut self) {
        self.state = EscrowState::Active;
    }

    pub fn dispute(&mut self, reason: String, evidence: String, dispute_time: UnixTimestamp) {
        self.state = EscrowState::Disputed;
        self.dispute_reason = Some(reason);
        self.dispute_evidence = Some(evidence);
        self.disputed_at = Some(dispute_time);
    }

    pub fn release(&mut self, completion_time: UnixTimestamp) {
        self.state = EscrowState::Released;
        self.completed_at = Some(completion_time);
    }

    pub fn claim(&mut self, completion_time: UnixTimestamp) {
        self.state = EscrowState::Claimed;
        self.completed_at = Some(completion_time);
    }

    pub fn cancel(&mut self, completion_time: UnixTimestamp) {
        self.state = EscrowState::Cancelled;
        self.completed_at = Some(completion_time);
    }

    pub fn resolve(&mut self, resolution_notes: String, completion_time: UnixTimestamp) {
        self.resolution_notes = Some(resolution_notes);
        self.completed_at = Some(completion_time);
    }
}

impl Sealed for EscrowAccount {}

impl IsInitialized for EscrowAccount {
    fn is_initialized(&self) -> bool {
        !matches!(self.state, EscrowState::Uninitialized)
    }
}

impl Pack for EscrowAccount {
    const LEN: usize = Self::LEN;

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }

    fn unpack_from_slice(src: &[u8]) -> Result<Self, solana_program::program_error::ProgramError> {
        Self::try_from_slice(src).map_err(|_| solana_program::program_error::ProgramError::InvalidAccountData)
    }
}