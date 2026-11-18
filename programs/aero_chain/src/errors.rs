use anchor_lang::prelude::*;

#[error_code]
pub enum AeroChainError {
    #[msg("The flight route is too long.")]
    RouteTooLong,
    #[msg("The passenger name is too long.")]
    PassengerNameTooLong,
    #[msg("The seat number must be between 1 and 9.")]
    InvalidSeat,
    #[msg("The flight is not open for bookings.")]
    FlightNotBookable,
    #[msg("The flight has reached its nine-passenger limit.")]
    FlightFull,
    #[msg("The flight still has active bookings.")]
    ActiveBookingsRemain,
    #[msg("The flight is already cancelled.")]
    FlightAlreadyCancelled,
}
