# Acceptance test plan

The test suite must execute against a local validator or Devnet and assert both successful state changes and rejected transactions.

## Nine-passenger capacity test
1. Create a flight.
2. Create nine distinct passenger keypairs.
3. Book seats 1 through 9, one passenger per seat.
4. Fetch Flight and assert `active_bookings === 9`.
5. Attempt a tenth booking (use a fresh wallet and a valid seat candidate); assert transaction fails with `FlightFull`.
6. Assert the count remains 9 and the original nine Passenger/Seat PDAs remain intact.

## Seat uniqueness
- Passenger A books seat 4.
- Passenger B attempts seat 4.
- Assert the second transaction fails because the Seat PDA already exists.
- Assert only A's Passenger and Seat accounts exist.

## Permissions
- Non-authority attempts `update_flight`: reject.
- Passenger A attempts to update Passenger B's account: reject due PDA/`has_one` constraints.
- Passenger A updates their own name: succeed.
- Non-owner attempts `cancel_booking`: reject.

## Lifecycle
- Cancel a booking as its owner; assert Passenger and Seat accounts are closed and count decreases by one.
- Another passenger books the released seat; succeed.
- Attempt `cancel_flight` with active bookings: reject.
- Cancel all remaining bookings, then cancel flight as authority: succeed and status becomes `Cancelled`.
- Attempt a new booking on cancelled flight: reject.

## Boundary validation
- Seat 0 and seat 10: reject.
- Route longer than 64 UTF-8 bytes: reject.
- Passenger name longer than 48 UTF-8 bytes: reject.
- Duplicate wallet booking on same flight: reject because Passenger PDA already exists.
