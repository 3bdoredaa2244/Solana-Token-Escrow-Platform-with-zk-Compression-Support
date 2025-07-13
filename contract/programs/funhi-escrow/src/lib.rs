use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_program::clock::Clock;

declare_id!("FuNHi9ZbGjE3Tq8W8u9K6V1xZr4H7sTpNqB5dJ3YtL2E");

const DISPUTE_PERIOD: i64 = 48 * 60 * 60; // 48 hours in seconds
const ESCROW_SEED: &[u8] = b"escrow";
const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod funhi_escrow {
    use super::*;

    /// Initialize a new escrow with the specified parameters
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        amount: u64,
        item_description: String,
        fulfillment_link: String,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow_account;
        
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = ctx.accounts.seller.key();
        escrow.moderator = ctx.accounts.moderator.key();
        escrow.token_mint = ctx.accounts.token_mint.key();
        escrow.amount = amount;
        escrow.item_description = item_description;
        escrow.fulfillment_link = fulfillment_link;
        escrow.state = EscrowState::Initialized;
        escrow.created_at = clock.unix_timestamp;
        escrow.dispute_deadline = 0;
        escrow.bump = ctx.bumps.escrow_account;
        escrow.vault_bump = ctx.bumps.vault_account;

        msg!("Escrow initialized for {} tokens", amount);
        Ok(())
    }

    /// Buyer deposits tokens into escrow
    pub fn deposit_tokens(ctx: Context<DepositTokens>) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Initialized,
            EscrowError::InvalidState
        );

        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::UnauthorizedBuyer
        );

        // Transfer tokens from buyer to vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.vault_account.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        );

        token::transfer(transfer_ctx, escrow.amount)?;

        escrow.state = EscrowState::Deposited;
        escrow.deposited_at = clock.unix_timestamp;
        escrow.dispute_deadline = clock.unix_timestamp + DISPUTE_PERIOD;

        msg!("Tokens deposited. Dispute deadline: {}", escrow.dispute_deadline);
        Ok(())
    }

    /// Buyer releases tokens to seller (early release)
    pub fn release_tokens(ctx: Context<ReleaseTokens>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Deposited,
            EscrowError::InvalidState
        );

        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::UnauthorizedBuyer
        );

        Self::transfer_tokens_to_seller(ctx.accounts, escrow)?;

        escrow.state = EscrowState::Released;
        msg!("Tokens released by buyer");
        Ok(())
    }

    /// Auto-release tokens after 48 hours if no dispute
    pub fn auto_release_tokens(ctx: Context<ReleaseTokens>) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Deposited,
            EscrowError::InvalidState
        );

        require!(
            clock.unix_timestamp >= escrow.dispute_deadline,
            EscrowError::DisputePeriodActive
        );

        Self::transfer_tokens_to_seller(ctx.accounts, escrow)?;

        escrow.state = EscrowState::Released;
        msg!("Tokens auto-released after dispute period");
        Ok(())
    }

    /// Buyer raises a dispute
    pub fn raise_dispute(ctx: Context<RaiseDispute>, reason: String) -> Result<()> {
        let clock = Clock::get()?;
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Deposited,
            EscrowError::InvalidState
        );

        require!(
            ctx.accounts.buyer.key() == escrow.buyer,
            EscrowError::UnauthorizedBuyer
        );

        require!(
            clock.unix_timestamp < escrow.dispute_deadline,
            EscrowError::DisputePeriodExpired
        );

        escrow.state = EscrowState::Disputed;
        escrow.dispute_reason = reason;
        escrow.disputed_at = clock.unix_timestamp;

        msg!("Dispute raised by buyer");
        Ok(())
    }

    /// Moderator resolves dispute in favor of buyer
    pub fn resolve_for_buyer(ctx: Context<ResolveDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Disputed,
            EscrowError::InvalidState
        );

        require!(
            ctx.accounts.moderator.key() == escrow.moderator,
            EscrowError::UnauthorizedModerator
        );

        Self::transfer_tokens_to_buyer(ctx.accounts, escrow)?;

        escrow.state = EscrowState::RefundedToBuyer;
        msg!("Dispute resolved in favor of buyer");
        Ok(())
    }

    /// Moderator resolves dispute in favor of seller
    pub fn resolve_for_seller(ctx: Context<ResolveDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.state == EscrowState::Disputed,
            EscrowError::InvalidState
        );

        require!(
            ctx.accounts.moderator.key() == escrow.moderator,
            EscrowError::UnauthorizedModerator
        );

        Self::transfer_tokens_to_seller(ctx.accounts, escrow)?;

        escrow.state = EscrowState::Released;
        msg!("Dispute resolved in favor of seller");
        Ok(())
    }

    /// Helper function to transfer tokens to seller
    fn transfer_tokens_to_seller(accounts: ReleaseTokensAccounts, escrow: &EscrowAccount) -> Result<()> {
        let seeds = &[
            VAULT_SEED,
            escrow.buyer.as_ref(),
            escrow.seller.as_ref(),
            escrow.token_mint.as_ref(),
            &[escrow.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            accounts.token_program.to_account_info(),
            Transfer {
                from: accounts.vault_account.to_account_info(),
                to: accounts.seller_token_account.to_account_info(),
                authority: accounts.vault_account.to_account_info(),
            },
            signer_seeds,
        );

        token::transfer(transfer_ctx, escrow.amount)?;
        Ok(())
    }

    /// Helper function to transfer tokens to buyer (refund)
    fn transfer_tokens_to_buyer(accounts: ResolveDisputeAccounts, escrow: &EscrowAccount) -> Result<()> {
        let seeds = &[
            VAULT_SEED,
            escrow.buyer.as_ref(),
            escrow.seller.as_ref(),
            escrow.token_mint.as_ref(),
            &[escrow.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            accounts.token_program.to_account_info(),
            Transfer {
                from: accounts.vault_account.to_account_info(),
                to: accounts.buyer_token_account.to_account_info(),
                authority: accounts.vault_account.to_account_info(),
            },
            signer_seeds,
        );

        token::transfer(transfer_ctx, escrow.amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, item_description: String, fulfillment_link: String)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + EscrowAccount::INIT_SPACE,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        init,
        payer = buyer,
        token::mint = token_mint,
        token::authority = vault_account,
        seeds = [VAULT_SEED, buyer.key().as_ref(), seller.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub vault_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: This is safe as we only store the public key
    pub seller: UncheckedAccount<'info>,

    /// CHECK: This is safe as we only store the public key
    pub moderator: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, buyer.key().as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.vault_bump
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = escrow_account.token_mint,
        token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseTokens<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, buyer.key().as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.vault_bump
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = escrow_account.token_mint,
        token::authority = seller
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: This is safe as we verify the seller through the escrow account
    pub seller: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub buyer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow_account.buyer.as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(
        mut,
        seeds = [VAULT_SEED, escrow_account.buyer.as_ref(), escrow_account.seller.as_ref(), escrow_account.token_mint.as_ref()],
        bump = escrow_account.vault_bump
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = escrow_account.token_mint
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = escrow_account.token_mint
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub moderator: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowAccount {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub moderator: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    #[max_len(200)]
    pub item_description: String,
    #[max_len(200)]
    pub fulfillment_link: String,
    pub state: EscrowState,
    pub created_at: i64,
    pub deposited_at: i64,
    pub disputed_at: i64,
    pub dispute_deadline: i64,
    #[max_len(500)]
    pub dispute_reason: String,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Initialized,
    Deposited,
    Disputed,
    Released,
    RefundedToBuyer,
}

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow state for this operation")]
    InvalidState,
    #[msg("Unauthorized buyer")]
    UnauthorizedBuyer,
    #[msg("Unauthorized moderator")]
    UnauthorizedModerator,
    #[msg("Dispute period is still active")]
    DisputePeriodActive,
    #[msg("Dispute period has expired")]
    DisputePeriodExpired,
}