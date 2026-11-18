use anchor_lang::prelude::*;

pub mod errors;
pub mod state;
use errors::AeroChainError;
use state::{Flight, FlightStatus, Passenger, Seat, MAX_PASSENGERS, MAX_PASSENGER_NAME_LEN, MAX_ROUTE_LEN};

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZ8r6YfG6vYp4M8wGJx2q"); // Replace with your generated program ID.

#[program]
pub mod aero_chain {
    use super::*;

    pub fn create_flight(
        ctx: Context<CreateFlight>,
        flight_id: u64,
        route: String,
        departure_ts: i64,
    ) -> Result<()> {
        require!(route.as_bytes().len() <= MAX_ROUTE_LEN, AeroChainError::RouteTooLong);
        let flight = &mut ctx.accounts.flight;
        flight.authority = ctx.accounts.authority.key();
        flight.flight_id = flight_id;
        flight.route = route;
        flight.departure_ts = departure_ts;
        flight.status = FlightStatus::Scheduled;
        flight.active_bookings = 0;
        flight.bump = ctx.bumps.flight;
        Ok(())
    }

    pub fn update_flight(
        ctx: Context<UpdateFlight>,
        route: String,
        departure_ts: i64,
    ) -> Result<()> {
        require!(route.as_bytes().len() <= MAX_ROUTE_LEN, AeroChainError::RouteTooLong);
        require!(ctx.accounts.flight.status == FlightStatus::Scheduled, AeroChainError::FlightAlreadyCancelled);
        ctx.accounts.flight.route = route;
        ctx.accounts.flight.departure_ts = departure_ts;
        Ok(())
    }

    pub fn book_passenger(
    ctx: Context<BookPassenger>,
    seat_number: u8,
    passenger_name: String,
    ) -> Result<()> {
        require!(
        ctx.accounts.flight.active_bookings < MAX_PASSENGERS,
        AeroChainError::FlightFull
        );

        require!(
        (1..=MAX_PASSENGERS).contains(&seat_number),
        AeroChainError::InvalidSeat
        );

        require!(
        passenger_name.as_bytes().len() <= MAX_PASSENGER_NAME_LEN,
        AeroChainError::PassengerNameTooLong
        );

        require!(
        ctx.accounts.flight.status == FlightStatus::Scheduled,
        AeroChainError::FlightNotBookable
        );

        let passenger = &mut ctx.accounts.passenger;
        passenger.flight = ctx.accounts.flight.key();
        passenger.passenger_wallet = ctx.accounts.passenger_wallet.key();
        passenger.seat_number = seat_number;
        passenger.passenger_name = passenger_name;
        passenger.bump = ctx.bumps.passenger;

        let seat = &mut ctx.accounts.seat;
        seat.flight = ctx.accounts.flight.key();
        seat.seat_number = seat_number;
        seat.passenger = ctx.accounts.passenger_wallet.key();
        seat.bump = ctx.bumps.seat;

        ctx.accounts.flight.active_bookings = ctx.accounts.flight.active_bookings
        .checked_add(1)
        .ok_or(AeroChainError::FlightFull)?;

        Ok(())
    }

    pub fn update_passenger(
        ctx: Context<UpdatePassenger>,
        passenger_name: String,
    ) -> Result<()> {
        require!(passenger_name.as_bytes().len() <= MAX_PASSENGER_NAME_LEN, AeroChainError::PassengerNameTooLong);
        ctx.accounts.passenger.passenger_name = passenger_name;
        Ok(())
    }

    pub fn cancel_booking(ctx: Context<CancelBooking>) -> Result<()> {
        ctx.accounts.flight.active_bookings = ctx.accounts.flight.active_bookings
            .checked_sub(1).ok_or(AeroChainError::FlightFull)?;
        // Passenger and Seat accounts are closed to the passenger by account constraints.
        Ok(())
    }

    pub fn cancel_flight(ctx: Context<CancelFlight>) -> Result<()> {
        require!(ctx.accounts.flight.active_bookings == 0, AeroChainError::ActiveBookingsRemain);
        ctx.accounts.flight.status = FlightStatus::Cancelled;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(flight_id: u64)]
pub struct CreateFlight<'info> {
    #[account(
        init,
        payer = authority,
        space = Flight::SPACE,
        seeds = [b"flight", flight_id.to_le_bytes().as_ref()],
        bump
    )]
    pub flight: Account<'info, Flight>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFlight<'info> {
    #[account(
        mut,
        seeds = [b"flight", flight.flight_id.to_le_bytes().as_ref()],
        bump = flight.bump,
        has_one = authority
    )]
    pub flight: Account<'info, Flight>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(seat_number: u8)]
pub struct BookPassenger<'info> {
    // Conserva aquí todas tus cuentas y validaciones actuales.
    #[account(
        mut,
        seeds = [b"flight", flight.flight_id.to_le_bytes().as_ref()],
        bump = flight.bump
    )]
    pub flight: Account<'info, Flight>,
    #[account(
        init,
        payer = passenger_wallet,
        space = Passenger::SPACE,
        seeds = [b"passenger", flight.key().as_ref(), passenger_wallet.key().as_ref()],
        bump
    )]
    pub passenger: Account<'info, Passenger>,
    #[account(
        init,
        payer = passenger_wallet,
        space = Seat::SPACE,
        seeds = [b"seat", flight.key().as_ref(), &[seat_number]],
        bump
    )]
    pub seat: Account<'info, Seat>,
    #[account(mut)]
    pub passenger_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePassenger<'info> {
    #[account(
        seeds = [b"flight", flight.flight_id.to_le_bytes().as_ref()],
        bump = flight.bump
    )]
    pub flight: Account<'info, Flight>,
    #[account(
        mut,
        seeds = [b"passenger", flight.key().as_ref(), passenger_wallet.key().as_ref()],
        bump = passenger.bump,
        has_one = passenger_wallet
    )]
    pub passenger: Account<'info, Passenger>,
    pub passenger_wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelBooking<'info> {
    #[account(
        mut,
        seeds = [b"flight", flight.flight_id.to_le_bytes().as_ref()],
        bump = flight.bump
    )]
    pub flight: Account<'info, Flight>,
    #[account(
        mut,
        close = passenger_wallet,
        seeds = [b"passenger", flight.key().as_ref(), passenger_wallet.key().as_ref()],
        bump = passenger.bump,
        has_one = passenger_wallet
    )]
    pub passenger: Account<'info, Passenger>,
    #[account(
        mut,
        close = passenger_wallet,
        seeds = [b"seat", flight.key().as_ref(), &[passenger.seat_number]],
        bump = seat.bump,
        constraint = seat.passenger == passenger_wallet.key()
    )]
    pub seat: Account<'info, Seat>,
    #[account(mut)]
    pub passenger_wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelFlight<'info> {
    #[account(
        mut,
        seeds = [b"flight", flight.flight_id.to_le_bytes().as_ref()],
        bump = flight.bump,
        has_one = authority
    )]
    pub flight: Account<'info, Flight>,
    pub authority: Signer<'info>,
}
