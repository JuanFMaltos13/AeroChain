# Technical architecture

## Accounts
- `Flight`: administrator, numeric ID, route, departure timestamp, status, active booking count, PDA bump.
- `Passenger`: flight, wallet, seat number, passenger name, booking status, bump.
- `Seat`: flight, seat number and passenger wallet. It exists only while the seat is occupied.

## Authority model
| Operation | Required signer | On-chain condition |
|---|---|---|
| Create flight | administrator | signer pays for Flight PDA |
| Update flight | flight authority | `has_one = authority` |
| Book seat | passenger | active flight, seat 1–9, count below 9 |
| Update passenger | passenger wallet | `has_one = passenger` and matching PDA |
| Cancel booking | passenger wallet | owns Passenger PDA; closes Passenger and Seat |
| Cancel flight | flight authority | active booking count equals zero |

## Invariants
1. `active_bookings <= 9`.
2. Seat number is in `1..=9`.
3. A Seat PDA can exist only once for a `(flight, seat_number)` pair.
4. Passenger PDA is unique for `(flight, wallet)`, so one wallet has at most one active booking per flight.
5. Booking and cancellation update `active_bookings` atomically with account creation/closure.
6. Cancellation is blocked until all active bookings are cancelled.

## Account lifecycle
`create_flight` initializes Flight.
`book_passenger` initializes Passenger and Seat in one transaction.
`cancel_booking` closes Passenger and Seat and decrements the counter in one transaction.
`cancel_flight` changes status to Cancelled; it does not close the account, preserving an auditable final state.

## Notes for production hardening
- Add explicit timestamp policy (e.g. prohibit booking after departure).
- Decide whether the administrator can reassign seats or refund payments.
- If payments are added, use checked arithmetic and an escrow/PDA vault with explicit refund paths.
- Consider a dedicated `close_flight` instruction only if the assignment requires account reclamation; keep it separate from logical cancellation.
