
use anchor_lang::prelude::*;

declare_id!("E3Ai1odomZQjyXAbvy1bRpXuvXATELeYKZ7HVsShvg2C");

// ============================================================
// AeroChain
// Sistema descentralizado de reservaciones de vuelos.
//
// Capacidad maxima por vuelo: 9 pasajeros.
// Cada reservacion pertenece al wallet del pasajero.
// El creador del vuelo es su propietario.
// ============================================================

#[program]
pub mod aerochain {
    use super::*;

    // --------------------------------------------------------
    // 1. Crear vuelo
    // --------------------------------------------------------
    pub fn create_flight(
        ctx: Context<CreateFlight>,
        flight_number: String,
        origin: String,
        destination: String,
    ) -> Result<()> {
        require!(
            !flight_number.is_empty() && flight_number.len() <= 10,
            AeroChainError::InvalidFlightNumber
        );

        require!(
            !origin.is_empty() && origin.len() <= 30,
            AeroChainError::InvalidOrigin
        );

        require!(
            !destination.is_empty() && destination.len() <= 30,
            AeroChainError::InvalidDestination
        );

        let flight = &mut ctx.accounts.flight;

        flight.owner = ctx.accounts.owner.key();
        flight.flight_number = flight_number;
        flight.origin = origin;
        flight.destination = destination;
        flight.reservations = Vec::new();
        flight.occupied_seats = Vec::new();
        flight.reservation_counter = 0;

        msg!("AeroChain: Flight created successfully");
        msg!("Flight number: {}", flight.flight_number);
        msg!("Origin: {}", flight.origin);
        msg!("Destination: {}", flight.destination);

        Ok(())
    }

    // --------------------------------------------------------
    // 2. Reservar asiento
    // --------------------------------------------------------
    pub fn reserve_seat(
        ctx: Context<ReserveSeat>,
        passenger_name: String,
        seat: String,
    ) -> Result<()> {
        require!(
            !passenger_name.is_empty() && passenger_name.len() <= 30,
            AeroChainError::InvalidPassengerName
        );

        validate_seat(&seat)?;

        let flight = &ctx.accounts.flight;

        // Validar capacidad maxima.
        require!(
            flight.reservations.len() < 9,
            AeroChainError::FlightFull
        );

        // Validar que el asiento no este ocupado.
        require!(
            !flight.occupied_seats.contains(&seat),
            AeroChainError::SeatOccupied
        );

        // ID automatico de reservacion.
        let reservation_id = flight.reservation_counter;

        // Capturar la PDA antes de modificar el Flight.
        let reservation_key = ctx.accounts.reservation.key();

        // Crear la reservacion.
        let reservation = &mut ctx.accounts.reservation;

        reservation.reservation_id = reservation_id;
        reservation.passenger = ctx.accounts.passenger.key();
        reservation.passenger_name = passenger_name;
        reservation.seat = seat.clone();

        // Actualizar Flight.
        let flight = &mut ctx.accounts.flight;

        flight.reservations.push(reservation_key);
        flight.occupied_seats.push(seat);

        flight.reservation_counter = flight
            .reservation_counter
            .checked_add(1)
            .ok_or(AeroChainError::CounterOverflow)?;

        msg!("AeroChain: Reservation created successfully");
        msg!("Reservation ID: {}", reservation_id);
        msg!("Passenger: {}", reservation.passenger_name);
        msg!("Seat: {}", reservation.seat);

        Ok(())
    }

    // --------------------------------------------------------
    // 3. Cambiar asiento
    // --------------------------------------------------------
    pub fn change_seat(
        ctx: Context<ChangeSeat>,
        reservation_id: u16,
        new_seat: String,
    ) -> Result<()> {
        validate_seat(&new_seat)?;

        let flight = &ctx.accounts.flight;

        let reservation = &ctx.accounts.reservation;

        // No permitir seleccionar el mismo asiento.
        require!(
            reservation.seat != new_seat,
            AeroChainError::SeatSame
        );

        // Validar disponibilidad del nuevo asiento.
        require!(
            !flight.occupied_seats.contains(&new_seat),
            AeroChainError::SeatOccupied
        );

        let old_seat = reservation.seat.clone();

        // Verificar que el asiento anterior exista en el indice.
        let old_seat_index = flight
            .occupied_seats
            .iter()
            .position(|seat| seat == &old_seat)
            .ok_or(AeroChainError::ReservationNotFound)?;

        // Actualizar el asiento en Flight.
        let flight = &mut ctx.accounts.flight;
        flight.occupied_seats[old_seat_index] = new_seat.clone();

        // Actualizar la reservacion.
        let reservation = &mut ctx.accounts.reservation;
        reservation.seat = new_seat.clone();

        msg!("AeroChain: Seat changed successfully");
        msg!("Reservation ID: {}", reservation_id);
        msg!("Previous seat: {}", old_seat);
        msg!("New seat: {}", new_seat);

        Ok(())
    }

    // --------------------------------------------------------
    // 4. Cancelar reservacion
    // --------------------------------------------------------
    pub fn cancel_reservation(
        ctx: Context<CancelReservation>,
        reservation_id: u16,
    ) -> Result<()> {
        let reservation_key = ctx.accounts.reservation.key();
        let seat_to_release = ctx.accounts.reservation.seat.clone();

        let flight = &ctx.accounts.flight;

        // Verificar que la reservacion este registrada.
        require!(
            flight.reservations.contains(&reservation_key),
            AeroChainError::ReservationNotFound
        );

        // Verificar que el asiento este registrado como ocupado.
        require!(
            flight.occupied_seats.contains(&seat_to_release),
            AeroChainError::ReservationNotFound
        );

        // Eliminar reservacion del Flight.
        let flight = &mut ctx.accounts.flight;

        flight
            .reservations
            .retain(|key| key != &reservation_key);

        // Liberar el asiento.
        flight
            .occupied_seats
            .retain(|seat| seat != &seat_to_release);

        msg!("AeroChain: Reservation cancelled successfully");
        msg!("Reservation ID: {}", reservation_id);
        msg!("Released seat: {}", seat_to_release);

        // Reservation se cerrara automaticamente mediante close.
        Ok(())
    }
}

// ============================================================
// VALIDACIONES AUXILIARES
// ============================================================

fn validate_seat(seat: &String) -> Result<()> {
    require!(
        !seat.is_empty() && seat.len() <= 3,
        AeroChainError::InvalidSeat
    );

    Ok(())
}

// ============================================================
// CUENTAS
// ============================================================

// ------------------------------------------------------------
// Flight: Cuenta raiz
// ------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Flight {
    pub owner: Pubkey,

    #[max_len(10)]
    pub flight_number: String,

    #[max_len(30)]
    pub origin: String,

    #[max_len(30)]
    pub destination: String,

    #[max_len(9)]
    pub reservations: Vec<Pubkey>,

    #[max_len(9, 3)]
    pub occupied_seats: Vec<String>,

    pub reservation_counter: u16,
}

// ------------------------------------------------------------
// Reservation: Cuenta hija
// ------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Reservation {
    pub reservation_id: u16,

    pub passenger: Pubkey,

    #[max_len(30)]
    pub passenger_name: String,

    #[max_len(3)]
    pub seat: String,
}

// ============================================================
// CONTEXTOS DE INSTRUCCIONES
// ============================================================

// ------------------------------------------------------------
// Instruction: create_flight
//
// Account tree:
// Flight
// Seeds:
// [b"flight", flight_number, owner]
// ------------------------------------------------------------

#[derive(Accounts)]
#[instruction(flight_number: String)]
pub struct CreateFlight<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = Flight::INIT_SPACE + 8,
        seeds = [
            b"flight",
            flight_number.as_bytes(),
            owner.key().as_ref()
        ],
        bump
    )]
    pub flight: Account<'info, Flight>,

    pub system_program: Program<'info, System>,
}

// ------------------------------------------------------------
// Instruction: reserve_seat
//
// Account tree:
// Flight
//   └── Reservation
//
// Reservation seeds:
// [b"reservation", flight, reservation_id]
// ------------------------------------------------------------

#[derive(Accounts)]
pub struct ReserveSeat<'info> {
    #[account(mut)]
    pub passenger: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"flight",
            flight.flight_number.as_bytes(),
            flight.owner.as_ref()
        ],
        bump
    )]
    pub flight: Account<'info, Flight>,

    #[account(
        init,
        payer = passenger,
        space = Reservation::INIT_SPACE + 8,
        seeds = [
            b"reservation",
            flight.key().as_ref(),
            flight.reservation_counter.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub reservation: Account<'info, Reservation>,

    pub system_program: Program<'info, System>,
}

// ------------------------------------------------------------
// Instruction: change_seat
//
// Account tree:
// Flight
//   └── Reservation
//
// Reservation seeds:
// [b"reservation", flight, reservation_id]
// ------------------------------------------------------------

#[derive(Accounts)]
#[instruction(reservation_id: u16)]
pub struct ChangeSeat<'info> {
    pub passenger: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"flight",
            flight.flight_number.as_bytes(),
            flight.owner.as_ref()
        ],
        bump
    )]
    pub flight: Account<'info, Flight>,

    #[account(
        mut,
        has_one = passenger,
        seeds = [
            b"reservation",
            flight.key().as_ref(),
            reservation_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub reservation: Account<'info, Reservation>,
}

// ------------------------------------------------------------
// Instruction: cancel_reservation
//
// Account tree:
// Flight
//   └── Reservation
//
// Reservation seeds:
// [b"reservation", flight, reservation_id]
//
// close = passenger
// ------------------------------------------------------------

#[derive(Accounts)]
#[instruction(reservation_id: u16)]
pub struct CancelReservation<'info> {
    #[account(mut)]
    pub passenger: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"flight",
            flight.flight_number.as_bytes(),
            flight.owner.as_ref()
        ],
        bump
    )]
    pub flight: Account<'info, Flight>,

    #[account(
        mut,
        has_one = passenger,
        close = passenger,
        seeds = [
            b"reservation",
            flight.key().as_ref(),
            reservation_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub reservation: Account<'info, Reservation>,
}

// ============================================================
// ERRORES PERSONALIZADOS
// ============================================================

#[error_code]
pub enum AeroChainError {
    #[msg("The flight has reached its maximum capacity of 9 passengers.")]
    FlightFull,

    #[msg("The selected seat is already occupied.")]
    SeatOccupied,

    #[msg("The reservation does not exist or is not registered.")]
    ReservationNotFound,

    #[msg("The wallet is not authorized to manage this reservation.")]
    UnauthorizedPassenger,

    #[msg("The new seat is the same as the current seat.")]
    SeatSame,

    #[msg("The seat format is invalid. Maximum length is 3 characters.")]
    InvalidSeat,

    #[msg("The passenger name is invalid. Maximum length is 30 characters.")]
    InvalidPassengerName,

    #[msg("The flight number is invalid. Maximum length is 10 characters.")]
    InvalidFlightNumber,

    #[msg("The origin is invalid. Maximum length is 30 characters.")]
    InvalidOrigin,

    #[msg("The destination is invalid. Maximum length is 30 characters.")]
    InvalidDestination,

    #[msg("The reservation counter overflowed.")]
    CounterOverflow,
}
