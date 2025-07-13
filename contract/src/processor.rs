use crate::{
    error::EscrowError,
    instruction::EscrowInstruction,
    state::{EscrowAccount, EscrowState},
};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EscrowInstruction::unpack(instruction_data)?;

        match instruction {
            EscrowInstruction::InitEscrow {
                amount,
                timeout_duration,
                item_description,
                fulfillment_link,
            } => {
                msg!("Instruction: InitEscrow");
                Self::process_init_escrow(
                    accounts,
                    amount,
                    timeout_duration,
                    item_description,
                    fulfillment_link,
                    program_id,
                )
            }
            EscrowInstruction::ReleaseEscrow => {
                msg!("Instruction: ReleaseEscrow");
                Self::process_release_escrow(accounts, program_id)
            }
            EscrowInstruction::ClaimEscrow => {
                msg!("Instruction: ClaimEscrow");
                Self::process_claim_escrow(accounts, program_id)
            }
            EscrowInstruction::CreateDispute { reason, evidence } => {
                msg!("Instruction: CreateDispute");
                Self::process_create_dispute(accounts, reason, evidence, program_id)
            }
            EscrowInstruction::ResolveDispute {
                release_to_seller,
                resolution_notes,
            } => {
                msg!("Instruction: ResolveDispute");
                Self::process_resolve_dispute(accounts, release_to_seller, resolution_notes, program_id)
            }
            EscrowInstruction::CancelEscrow => {
                msg!("Instruction: CancelEscrow");
                Self::process_cancel_escrow(accounts, program_id)
            }
        }
    }

    fn process_init_escrow(
        accounts: &[AccountInfo],
        amount: u64,
        timeout_duration: i64,
        item_description: String,
        fulfillment_link: String,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let seller_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let token_mint_info = next_account_info(account_info_iter)?;
        let buyer_token_info = next_account_info(account_info_iter)?;
        let escrow_token_info = next_account_info(account_info_iter)?;
        let moderator_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;
        let rent_sysvar = next_account_info(account_info_iter)?;

        // Verify signer
        if !buyer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Check rent exemption
        let rent = &Rent::from_account_info(rent_sysvar)?;
        if !rent.is_exempt(escrow_info.lamports(), EscrowAccount::LEN) {
            return Err(EscrowError::NotRentExempt.into());
        }

        // Create escrow account
        invoke(
            &system_instruction::create_account(
                buyer_info.key,
                escrow_info.key,
                rent.minimum_balance(EscrowAccount::LEN),
                EscrowAccount::LEN as u64,
                program_id,
            ),
            &[
                buyer_info.clone(),
                escrow_info.clone(),
                system_program.clone(),
            ],
        )?;

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Initialize escrow account
        let mut escrow_account = EscrowAccount::new(
            *buyer_info.key,
            *seller_info.key,
            *moderator_info.key,
            *token_mint_info.key,
            *escrow_token_info.key,
            amount,
            timeout_duration,
            item_description,
            fulfillment_link,
            current_time,
        );

        // Transfer tokens from buyer to escrow
        Self::transfer_tokens(
            buyer_token_info,
            escrow_token_info,
            buyer_info,
            token_program,
            amount,
        )?;

        // Activate the escrow
        escrow_account.activate();

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Escrow initialized successfully");
        Ok(())
    }

    fn process_release_escrow(accounts: &[AccountInfo], _program_id: &Pubkey) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let seller_token_info = next_account_info(account_info_iter)?;
        let escrow_token_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        // Verify signer
        if !buyer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load escrow account
        let mut escrow_account = EscrowAccount::unpack(&escrow_info.data.borrow())?;

        // Verify buyer
        if escrow_account.buyer != *buyer_info.key {
            return Err(EscrowError::InvalidAuthority.into());
        }

        // Check escrow state
        if !matches!(escrow_account.state, EscrowState::Active) {
            return Err(EscrowError::EscrowNotInitialized.into());
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Transfer tokens from escrow to seller
        Self::transfer_tokens_from_escrow(
            escrow_token_info,
            seller_token_info,
            escrow_info,
            token_program,
            escrow_account.amount,
        )?;

        // Update escrow state
        escrow_account.release(current_time);

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Escrow released successfully");
        Ok(())
    }

    fn process_claim_escrow(accounts: &[AccountInfo], _program_id: &Pubkey) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let seller_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let seller_token_info = next_account_info(account_info_iter)?;
        let escrow_token_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;
        let _clock_sysvar = next_account_info(account_info_iter)?;

        // Verify signer
        if !seller_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load escrow account
        let mut escrow_account = EscrowAccount::unpack(&escrow_info.data.borrow())?;

        // Verify seller
        if escrow_account.seller != *seller_info.key {
            return Err(EscrowError::InvalidAuthority.into());
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Check if timeout reached and no dispute
        if !escrow_account.can_be_claimed(current_time) {
            return Err(EscrowError::TimeoutNotReached.into());
        }

        // Transfer tokens from escrow to seller
        Self::transfer_tokens_from_escrow(
            escrow_token_info,
            seller_token_info,
            escrow_info,
            token_program,
            escrow_account.amount,
        )?;

        // Update escrow state
        escrow_account.claim(current_time);

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Escrow claimed successfully");
        Ok(())
    }

    fn process_create_dispute(
        accounts: &[AccountInfo],
        reason: String,
        evidence: String,
        _program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let _clock_sysvar = next_account_info(account_info_iter)?;

        // Verify signer
        if !buyer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load escrow account
        let mut escrow_account = EscrowAccount::unpack(&escrow_info.data.borrow())?;

        // Verify buyer
        if escrow_account.buyer != *buyer_info.key {
            return Err(EscrowError::InvalidAuthority.into());
        }

        // Check if dispute can be created
        if !escrow_account.can_be_disputed() {
            return Err(EscrowError::CannotDisputeAfterRelease.into());
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Create dispute
        escrow_account.dispute(reason, evidence, current_time);

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Dispute created successfully");
        Ok(())
    }

    fn process_resolve_dispute(
        accounts: &[AccountInfo],
        release_to_seller: bool,
        resolution_notes: String,
        _program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let moderator_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let winner_token_info = next_account_info(account_info_iter)?;
        let escrow_token_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        // Verify signer
        if !moderator_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load escrow account
        let mut escrow_account = EscrowAccount::unpack(&escrow_info.data.borrow())?;

        // Verify moderator
        if escrow_account.moderator != *moderator_info.key {
            return Err(EscrowError::InvalidModerator.into());
        }

        // Check if in dispute state
        if !matches!(escrow_account.state, EscrowState::Disputed) {
            return Err(EscrowError::DisputePeriodActive.into());
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Transfer tokens to winner
        Self::transfer_tokens_from_escrow(
            escrow_token_info,
            winner_token_info,
            escrow_info,
            token_program,
            escrow_account.amount,
        )?;

        // Update state based on resolution
        if release_to_seller {
            escrow_account.state = EscrowState::Released;
        } else {
            escrow_account.state = EscrowState::Cancelled;
        }

        escrow_account.resolve(resolution_notes, current_time);

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Dispute resolved successfully");
        Ok(())
    }

    fn process_cancel_escrow(accounts: &[AccountInfo], _program_id: &Pubkey) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let buyer_info = next_account_info(account_info_iter)?;
        let escrow_info = next_account_info(account_info_iter)?;
        let buyer_token_info = next_account_info(account_info_iter)?;
        let escrow_token_info = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;

        // Verify signer
        if !buyer_info.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load escrow account
        let mut escrow_account = EscrowAccount::unpack(&escrow_info.data.borrow())?;

        // Verify buyer
        if escrow_account.buyer != *buyer_info.key {
            return Err(EscrowError::InvalidAuthority.into());
        }

        // Check if cancellation is allowed (only in dispute state or before timeout)
        if !matches!(escrow_account.state, EscrowState::Active | EscrowState::Disputed) {
            return Err(EscrowError::EscrowAlreadyCompleted.into());
        }

        // Get current timestamp
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;

        // Transfer tokens back to buyer
        Self::transfer_tokens_from_escrow(
            escrow_token_info,
            buyer_token_info,
            escrow_info,
            token_program,
            escrow_account.amount,
        )?;

        // Update escrow state
        escrow_account.cancel(current_time);

        // Save escrow account
        EscrowAccount::pack(escrow_account, &mut escrow_info.data.borrow_mut())?;

        msg!("Escrow cancelled successfully");
        Ok(())
    }

    fn transfer_tokens(
        from_info: &AccountInfo,
        to_info: &AccountInfo,
        authority_info: &AccountInfo,
        token_program: &AccountInfo,
        amount: u64,
    ) -> ProgramResult {
        let transfer_instruction = spl_token::instruction::transfer(
            token_program.key,
            from_info.key,
            to_info.key,
            authority_info.key,
            &[],
            amount,
        )?;

        invoke(
            &transfer_instruction,
            &[
                from_info.clone(),
                to_info.clone(),
                authority_info.clone(),
                token_program.clone(),
            ],
        )
    }

    fn transfer_tokens_from_escrow(
        escrow_token_info: &AccountInfo,
        to_info: &AccountInfo,
        escrow_authority: &AccountInfo,
        token_program: &AccountInfo,
        amount: u64,
    ) -> ProgramResult {
        let transfer_instruction = spl_token::instruction::transfer(
            token_program.key,
            escrow_token_info.key,
            to_info.key,
            escrow_authority.key,
            &[],
            amount,
        )?;

        // The escrow account is the authority for the token account
        let seeds = &[
            b"escrow",
            escrow_authority.key.as_ref(),
        ];
        let (_, bump_seed) = Pubkey::find_program_address(seeds, escrow_authority.owner);
        let signer_seeds = &[
            b"escrow",
            escrow_authority.key.as_ref(),
            &[bump_seed],
        ];

        invoke_signed(
            &transfer_instruction,
            &[
                escrow_token_info.clone(),
                to_info.clone(),
                escrow_authority.clone(),
                token_program.clone(),
            ],
            &[signer_seeds],
        )
    }
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    Processor::process(program_id, accounts, instruction_data)
}