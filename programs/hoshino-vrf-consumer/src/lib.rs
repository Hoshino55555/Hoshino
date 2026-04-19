use anchor_lang::prelude::*;
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{
    create_request_regular_randomness_ix, RequestRandomnessParams,
};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

declare_id!("CSQ7mu1XoBv171bXFBhYCFNcLHp2Xbpa9voExh8qfBbp");

const VRF_REQUEST_SEED: &[u8] = b"vrf-request";

#[program]
pub mod hoshino_vrf_consumer {
    use super::*;

    pub fn request_randomness(
        ctx: Context<RequestRandomness>,
        purpose: u8,
        nonce: [u8; 32],
        caller_seed: [u8; 32],
    ) -> Result<()> {
        require!(is_valid_purpose(purpose), VrfConsumerError::InvalidPurpose);

        let vrf_request = &mut ctx.accounts.vrf_request;
        vrf_request.bump = ctx.bumps.vrf_request;
        vrf_request.user = ctx.accounts.user.key();
        vrf_request.purpose = purpose;
        vrf_request.nonce = nonce;
        vrf_request.oracle_queue = ctx.accounts.oracle_queue.key();
        vrf_request.status = RequestStatus::Pending;
        vrf_request.randomness = [0; 32];
        vrf_request.requested_at = Clock::get()?.unix_timestamp;
        vrf_request.fulfilled_at = 0;

        let ix = create_request_regular_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::CallbackFulfillRandomness::DISCRIMINATOR.to_vec(),
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: vrf_request.key(),
                is_signer: false,
                is_writable: true,
            }]),
            caller_seed,
            ..Default::default()
        });

        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

        Ok(())
    }

    pub fn callback_fulfill_randomness(
        ctx: Context<CallbackFulfillRandomness>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let vrf_request = &mut ctx.accounts.vrf_request;

        require!(
            vrf_request.status == RequestStatus::Pending,
            VrfConsumerError::RequestAlreadyFulfilled
        );

        vrf_request.status = RequestStatus::Fulfilled;
        vrf_request.randomness = randomness;
        vrf_request.fulfilled_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

fn is_valid_purpose(purpose: u8) -> bool {
    matches!(
        purpose,
        VrfPurpose::GachaOnboarding
            | VrfPurpose::GachaDaily
            | VrfPurpose::ForageRoll
            | VrfPurpose::StarburstSeed
    )
}

#[vrf]
#[derive(Accounts)]
#[instruction(purpose: u8, nonce: [u8; 32], _caller_seed: [u8; 32])]
pub struct RequestRandomness<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: The end-user identity this request is attributed to.
    pub user: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + VrfRequest::LEN,
        seeds = [VRF_REQUEST_SEED, user.key().as_ref(), &[purpose], &nonce],
        bump
    )]
    pub vrf_request: Account<'info, VrfRequest>,
    /// CHECK: MagicBlock's devnet Solana queue.
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CallbackFulfillRandomness<'info> {
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,
    #[account(
        mut,
        seeds = [
            VRF_REQUEST_SEED,
            vrf_request.user.as_ref(),
            &[vrf_request.purpose],
            &vrf_request.nonce
        ],
        bump = vrf_request.bump
    )]
    pub vrf_request: Account<'info, VrfRequest>,
}

#[account]
pub struct VrfRequest {
    pub bump: u8,
    pub user: Pubkey,
    pub purpose: u8,
    pub nonce: [u8; 32],
    pub oracle_queue: Pubkey,
    pub status: RequestStatus,
    pub randomness: [u8; 32],
    pub requested_at: i64,
    pub fulfilled_at: i64,
}

impl VrfRequest {
    pub const LEN: usize = 1 + 32 + 1 + 32 + 32 + 1 + 32 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestStatus {
    Pending,
    Fulfilled,
}

pub struct VrfPurpose;

impl VrfPurpose {
    pub const GachaOnboarding: u8 = 0;
    pub const GachaDaily: u8 = 1;
    pub const ForageRoll: u8 = 2;
    pub const StarburstSeed: u8 = 3;
}

#[error_code]
pub enum VrfConsumerError {
    #[msg("Unsupported VRF purpose.")]
    InvalidPurpose,
    #[msg("This randomness request has already been fulfilled.")]
    RequestAlreadyFulfilled,
}
