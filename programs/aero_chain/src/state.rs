use anchor_lang::prelude::*;

pub const MAX_PASSENGERS: u8 = 9;
pub const MAX_ROUTE_LEN: usize = 64;
pub const MAX_PASSENGER_NAME_LEN: usize = 48;

#[account]
pub struct Flight {
    pub authority: Pubkey,
    pub flight_id: u64,
    pub route: String,
    pub departure_ts: i64,
    pub status: FlightStatus,
    pub active_bookings: u8,
    pub bump: u8,
}

impl Flight {
    // discriminator + fixed fields + maximum route bytes
    pub const SPACE: usize = 8 + 32 + 8 + (4 + MAX_ROUTE_LEN) + 8 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum FlightStatus {
    Scheduled,
    Cancelled,
}

#[account]
pub struct Passenger {
    pub flight: Pubkey,
    pub passenger_wallet: Pubkey,
    pub seat_number: u8,
    pub passenger_name: String,
    pub bump: u8,
}

impl Passenger {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + (4 + MAX_PASSENGER_NAME_LEN) + 1;
}

#[account]
pub struct Seat {
    pub flight: Pubkey,
    pub seat_number: u8,
    pub passenger: Pubkey,
    pub bump: u8,
}

impl Seat {
    pub const SPACE: usize = 8 + 32 + 1 + 32 + 1;
}
