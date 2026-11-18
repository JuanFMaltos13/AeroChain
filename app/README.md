# Frontend integration contract

Recommended stack: React + Vite + TypeScript + Solana Wallet Adapter.

Frontend responsibilities:
- Connect/disconnect wallet; never request or store seed phrases.
- Fetch Flight accounts and display route, departure, status and available capacity.
- Derive Flight, Passenger and Seat PDAs using the exact seeds documented in the root README.
- Call generated Anchor client methods: `createFlight`, `updateFlight`, `bookPassenger`, `updatePassenger`, `cancelBooking`, `cancelFlight`.
- Refresh account state after confirmed transactions.
- Show transaction signature and link to Solana Explorer configured for Devnet.

Do not hardcode a sample IDL address as the AeroChain Program ID. Generate the IDL from this program after a successful build and deployment.
